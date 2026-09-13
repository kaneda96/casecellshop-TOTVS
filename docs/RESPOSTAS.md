# Parte 1.A — Respostas Conceituais

## Pergunta 1 — Diagnóstico e trade-offs

### 01 | Performance da vitrine

**Causa provável:** a loja consulta o ERP via API REST síncrona a cada acesso à
vitrine. O ERP é um monolito que também roda faturamento, financeiro e
contábil — não foi desenhado para responder a milhões de leituras de catálogo
por dia com baixa latência, e cada requisição da vitrine provavelmente dispara
uma consulta pesada (joins, cálculo de preço, checagem de estoque) que compete
por recursos com as rotinas internas do ERP.

**Impacto:**
- Cliente: abandono de carrinho logo na entrada do funil, percepção de site
  "quebrado" ou lento, perda de confiança.
- Negócio: perda direta de receita (cada segundo de atraso reduz conversão),
  e risco de sobrecarregar o ERP a ponto de atrapalhar operações internas
  (faturamento, financeiro) que dependem dele.

**Caminhos possíveis:**
1. **Cache de leitura entre a loja e o ERP** (ex: Redis, ou até cache em
   memória com TTL curto) para produtos, preços e estoque, atualizado por um
   job periódico ou por eventos.
   - Trade-off: estoque exibido pode ficar levemente desatualizado (segundos
     a minutos, dependendo do TTL). Baixo custo de implementação e baixo risco.
2. **Banco de leitura próprio da loja** (réplica/projeção dos dados do ERP,
   sincronizada por job ou CDC a partir do MySQL do ERP), servindo a vitrine
   sem nunca tocar o ERP em tempo real.
   - Trade-off: mais componentes para manter (pipeline de sincronização), mas
     desacopla completamente a vitrine do ERP e permite otimizar o schema para
     leitura (ex: desnormalizado, com índices pensados para busca/filtro).
3. **CDN / cache de borda** para páginas ou fragmentos de produto mais
   acessados.
   - Trade-off: bom para picos de tráfego repetido no mesmo produto, mas não
     resolve estoque (que muda com frequência) sozinho — funciona melhor como
     complemento aos dois caminhos acima.

**Priorização:** eu começaria pelo **banco próprio da loja alimentado por
sincronização assíncrona do ERP** (caminho 2), com cache em memória/Redis por
cima dele (caminho 1) para os produtos mais acessados. É o que mais reduz a
dependência direta do ERP (objetivo central do desafio) e, embora dê mais
trabalho que um cache simples, evita reconstruir essa peça de novo quando o
tráfego crescer ainda mais. O cache de borda (3) fica como otimização
posterior, pois ataca um sintoma (latência) sem resolver a causa
(acoplamento direto ao ERP).

---

### 02 | Consistência de estoque

**Causa provável:** a checagem de estoque e a decisão de vender provavelmente
acontecem sem nenhum mecanismo de reserva/trava — cada requisição de compra lê
o estoque, vê que há saldo, e "aceita" a venda, sem impedir que outra
requisição concorrente faça exatamente a mesma leitura antes da primeira
confirmar. Isso é uma clássica condição de corrida (race condition):
duas leituras acontecem antes de qualquer escrita.

**Impacto:**
- Cliente: paga por um produto que não existe, frustração, necessidade de
  reembolso/cancelamento, dano à confiança na marca.
- Negócio: custo de reembolso, custo operacional de atendimento, risco
  reputacional (reclamações públicas, avaliações negativas), e no limite,
  problema jurídico (propaganda enganosa / venda sem entrega).

**Caminhos possíveis:**
1. **Reserva de estoque com operação atômica** (banco com constraint/lock, ou
   um serviço dedicado que serializa as decisões de reserva) — decrementa o
   estoque disponível no momento da tentativa de compra, antes de confirmar
   o pedido.
   - Trade-off: exige desenhar bem o ciclo de vida da reserva (quando expira
     se o cliente não fechar o pedido), mas é a solução mais direta ao
     problema.
2. **Fila de pedidos processada sequencialmente por produto** (ex: partição
   por `productId` em uma fila), garantindo que decisões sobre o mesmo produto
   nunca sejam avaliadas em paralelo.
   - Trade-off: adiciona latência (o pedido espera a fila) e complexidade
     operacional (fila, workers, monitoramento), mas escala bem e é robusto.
3. **Overselling controlado + reconciliação**: aceitar a venda e resolver
   depois (cancelar/reembolsar o pedido excedente automaticamente).
   - Trade-off: simples de implementar, mas reintroduz exatamente a
     experiência ruim que o case quer evitar — não recomendo como solução
     principal, só como rede de segurança complementar.

**Priorização:** caminho 1 (reserva atômica de estoque) é a prioridade
máxima entre os três problemas do case — é o que gera prejuízo financeiro
direto e dano de confiança mais imediato. É relativamente barato de
implementar (uma coluna `reserved` + uma operação atômica de update) e
resolve a causa raiz, não o sintoma.

---

### 03 | Resiliência do checkout

**Causa provável:** o checkout de fato chama o ERP de forma síncrona para
gerar faturamento, e essa chamada às vezes demora mais que o timeout
configurado (no cliente, no load balancer, ou no próprio código). Quando isso
acontece, a requisição HTTP falha do ponto de vista do cliente, mas o
back-end pode ou não ter processado a operação no ERP — resultado: o cliente
"perde a compra" (viu erro), mesmo que o pedido possa ter sido criado.

**Impacto:**
- Cliente: acha que a compra falhou, tenta de novo (risco de comprar/pagar
  duas vezes) ou desiste (perda de venda). Em ambos os casos, experiência ruim.
- Negócio: perda de vendas por timeout, risco de cobrança duplicada se o
  cliente tentar de novo sem proteção de idempotência, e aumento de chamados
  de suporte.

**Caminhos possíveis:**
1. **Checkout assíncrono com resposta imediata**: a loja aceita o pedido,
   devolve uma resposta rápida (ex: "pedido recebido, processando") e
   processa a confirmação com o ERP em background, com o cliente consultando
   o status (polling ou WebSocket) até a confirmação.
   - Trade-off: exige que o front-end saiba lidar com um estado
     "processando" em vez de sucesso/erro imediato, mas remove o timeout do
     caminho crítico da experiência do usuário.
2. **Timeout curto + fila de retry no back-end**: o back-end tenta a chamada
   síncrona ao ERP com um timeout agressivo; se estourar, enfileira um job
   de retry e informa ao cliente que o pedido está em processamento.
   - Trade-off: parecido com o caminho 1, mas usa fila como mecanismo de
     retry — mais resiliente a picos e reinicializações do serviço, ao custo
     de mais infraestrutura.
3. **Aumentar o timeout e otimizar a chamada ao ERP** (ex: paralelizar
   etapas, reduzir payload).
   - Trade-off: mais simples de implementar, mas não resolve o problema de
     fundo (a UX ainda fica esperando o ERP) e só empurra o problema para
     picos de carga maiores.

**Priorização:** eu priorizaria o caminho 1 (checkout assíncrono com resposta
rápida + status consultável), que é exatamente o que implementei no
mini-projeto: o back-end responde em até ~2s mesmo que o ERP demore, e o
front-end faz polling do status. Reservo a fila de retry (caminho 2) como
evolução natural desse mesmo modelo quando o volume justificar (ver Pergunta 2).

---

## Pergunta 2 — Arquitetura alvo incremental

### Componentes principais

- **Loja (BFF/API própria da loja):** camada que o front-end consome. Nunca
  chama o ERP diretamente numa jornada crítica do cliente.
- **Banco de leitura da loja:** cópia local de produtos/preços/estoque,
  otimizada para leitura, populada por sincronização a partir do ERP.
- **Cache (Redis ou em memória):** na frente do banco de leitura, para os
  produtos mais acessados (reduz ainda mais a latência da vitrine).
- **Serviço de estoque/reserva:** dono da lógica de reserva, confirmação e
  liberação de estoque. É o único componente autorizado a decidir "posso
  vender esta unidade agora?" — centraliza a garantia de não-overselling.
- **Fila de pedidos/eventos (ex: RabbitMQ, SQS, ou até uma tabela de outbox):**
  desacopla o checkout do processamento síncrono no ERP.
- **Workers de sincronização:** dois sentidos —
  - ERP → Loja: job/CDC que replica catálogo, preço e estoque do MySQL do
    ERP para o banco da loja (leitura), em intervalos curtos (segundos a
    poucos minutos).
  - Loja → ERP: worker que consome a fila de pedidos confirmados e envia o
    faturamento para o ERP, com retry e backoff.
- **Banco de pedidos da loja:** guarda o pedido, seu status, a
  Idempotency-Key e o histórico de tentativas — fonte de verdade para o
  cliente consultar "onde está minha compra".

### Fluxo de dados

**Produtos/estoque (leitura):**
```
ERP (MySQL) --[job de sync / CDC]--> Banco de leitura da loja --[cache]--> Vitrine
```
A vitrine nunca lê o ERP diretamente. O "estoque disponível" mostrado ao
cliente é o estoque da loja menos as reservas ativas, sempre local.

**Checkout (escrita):**
```
Cliente -> API da loja:
  1. valida payload
  2. reserva estoque no banco/serviço de estoque (atômico, local)
  3. cria o pedido com status PROCESSING e responde rápido ao cliente
     (sucesso otimista, ou "processando" se preferir confirmar via fila)
  4. publica evento "pedido criado" na fila
Worker de faturamento:
  5. consome o evento, chama o ERP para faturar
  6. em sucesso: confirma o pedido e debita o estoque definitivamente
  7. em falha: aplica retry com backoff; se esgotar tentativas, cancela o
     pedido e libera a reserva de estoque, notificando o cliente
```

O cliente consulta o status do pedido (`GET /orders/:id`) enquanto o
processamento acontece — é essencialmente o mesmo padrão que implementei no
mini-projeto, só que lá o "worker" é uma chamada assíncrona simples em vez de
uma fila de verdade.

### Onde eu usaria cada peça

- **Cache:** na leitura de produtos/vitrine (TTL curto, invalidado pelo job
  de sync quando o preço/estoque mudar).
- **Fila:** entre "pedido criado" e "faturamento no ERP" — para não travar o
  cliente esperando o ERP, e para ter retry automático em caso de falha
  temporária.
- **Banco próprio da loja:** para catálogo (leitura) e para pedidos
  (escrita) — a loja precisa ser dona dos seus dados operacionais, só
  sincronizando com o ERP de forma assíncrona.
- **Jobs/workers:** sincronização periódica ERP→Loja (catálogo/estoque) e
  processamento assíncrono Loja→ERP (faturamento).

### Sincronização loja ↔ ERP

- **ERP é a fonte de verdade de faturamento e contabilidade.** A loja nunca
  inventa números financeiros — ela envia o pedido confirmado para o ERP
  processar o faturamento oficial.
- **Loja é a fonte de verdade de "estoque comprometido" em tempo real**
  (reservas). O estoque "bruto" (o que existe fisicamente) ainda vem do ERP,
  mas a decisão instantânea de "posso vender agora" é local à loja, para não
  depender da latência do ERP a cada clique de compra.
- **Reconciliação periódica:** um job compara o estoque final registrado no
  ERP com o que a loja debitou, para detectar divergências (ex: ajuste manual
  de estoque feito direto no ERP, devolução, etc.) e corrigir o banco de
  leitura da loja.

### Plano de 30 a 90 dias

- **0–30 dias:** implementar o serviço de reserva de estoque com garantia de
  atomicidade (ataca o problema 02, que é o de maior risco financeiro) e o
  checkout assíncrono com resposta rápida + idempotência (ataca o problema
  03). Isso já pode rodar com o banco da loja sendo apenas um cache
  simples/réplica leve do ERP, sem uma pipeline de sincronização sofisticada
  ainda.
- **30–60 dias:** construir o banco de leitura próprio da loja com
  sincronização periódica do catálogo (ataca o problema 01, performance da
  vitrine), com cache por cima. Introduzir a fila real entre checkout e
  faturamento (hoje seria uma chamada assíncrona direta).
- **60–90 dias:** reconciliação automatizada (loja x ERP), observabilidade
  por pedido (correlação de logs/rastreamento), e testes de carga para
  validar os novos componentes sob o volume real de milhões de acessos.

Prioridade lógica: **estoque e idempotência primeiro** (maior risco/prejuízo
e mais barato de resolver), **checkout assíncrono em seguida** (mesma
motivação), **performance da vitrine por último** entre os três — não porque
seja menos importante para o cliente, mas porque tecnicamente é o que exige
mais infraestrutura nova (pipeline de sincronização) para ser resolvido bem,
e um cache simples já alivia boa parte da dor enquanto isso é construído.

---

## Pergunta 3 — Estoque, concorrência e idempotência

### Como evitar venda duplicada

A decisão de "há estoque disponível?" precisa ser uma operação **atômica**:
ler e decrementar (ou marcar como reservado) em um único passo indivisível,
para que duas requisições concorrentes nunca vejam "estoque disponível: 1"
ao mesmo tempo e ambas decidam vender.

No mini-projeto, isso é feito de forma simples porque o Node.js roda em um
único processo/thread para código síncrono: a função `reserveStock` faz a
checagem (`disponível = estoque - reservado`) e a atualização
(`reservado += quantidade`) sem nenhum `await` no meio. Isso significa que,
mesmo que duas requisições HTTP cheguem "ao mesmo tempo", o event loop do
Node executa essa função inteira para a primeira requisição antes de sequer
começar a segunda — não existe brecha para as duas lerem o mesmo estoque
disponível.

Em produção, com banco de dados e possivelmente múltiplas instâncias do
back-end, o equivalente seria uma operação atômica no banco, por exemplo:

```sql
UPDATE products
SET reserved = reserved + :quantidade
WHERE id = :productId
  AND stock - reserved >= :quantidade;
```

Se a atualização afetar 0 linhas, significa que não havia estoque suficiente
— e isso é garantido pelo próprio banco, não pela aplicação, então funciona
mesmo com múltiplas instâncias do serviço rodando em paralelo.

### Reserva de estoque: quando é criada e quando expira

- **Criada:** no momento em que o cliente tenta finalizar a compra (chamada a
  `POST /orders`), antes de qualquer chamada ao ERP. A reserva é o que
  "trava" a unidade para aquele cliente enquanto o pagamento/faturamento é
  processado.
- **Expira:**
  - **Confirmada** (debitada definitivamente do estoque) quando o
    faturamento no ERP é concluído com sucesso.
  - **Liberada** (devolvida ao estoque disponível) quando o processamento
    falha definitivamente (erro do ERP sem chance de retry, ou pedido
    cancelado pelo cliente).
  - Em um sistema real eu adicionaria também um **TTL de segurança** (ex: 5
    a 15 minutos) para reservas que ficam "penduradas" — carrinho abandonado
    no meio do checkout, falha silenciosa do worker de faturamento, etc. Um
    job periódico libera reservas mais velhas que o TTL e sem pedido
    confirmado associado.

### Retry, timeout e duplo clique no checkout

- **Duplo clique:** o front-end desabilita o botão de compra assim que a
  primeira requisição é enviada, e só reabilita após receber uma resposta
  (sucesso, erro definitivo, ou timeout). Isso evita a maioria dos casos na
  origem.
- **Retry de rede / timeout do cliente:** mesmo com o botão desabilitado,
  uma conexão instável pode fazer o cliente (ou uma camada de retry
  automática) reenviar a mesma requisição. Isso é resolvido com
  **idempotência** (próximo tópico) — a segunda tentativa não cria um novo
  pedido nem reserva estoque de novo, apenas retorna o resultado da primeira.
- **Timeout do ERP dentro do back-end:** o back-end nunca deixa a requisição
  do cliente "pendurada" esperando o ERP indefinidamente. Ele aplica um
  timeout curto (no mini-projeto, 2 segundos) e, se estourar, responde ao
  cliente com um status "processando" (`202 PENDING`) em vez de erro — o
  cliente não perde a compra, só aguarda a confirmação.

### Idempotência para evitar pedidos duplicados

Todo `POST /orders` aceita um header `Idempotency-Key` (gerado pelo
front-end no momento em que o usuário clica em "Comprar", e reaproveitado
apenas em retries da mesma tentativa — não em uma nova compra). O back-end:

1. No início da requisição, checa se aquela chave já está associada a um
   pedido. Se sim, devolve o pedido existente (mesmo `orderId`, mesmo
   status) em vez de processar de novo.
2. Se não, segue o fluxo normal e **registra a chave antes de qualquer
   operação assíncrona**, no mesmo trecho síncrono da reserva de estoque —
   isso garante que duas requisições concorrentes com a mesma chave não
   consigam, cada uma, reservar estoque; a segunda encontra o registro feito
   pela primeira.

Isso significa que reenviar a mesma tentativa de compra (por timeout do
cliente, retry de rede, ou duplo clique que escapou da trava de UI) é
seguro: o cliente nunca é cobrado duas vezes nem gera dois pedidos.

### Reconciliação entre loja e ERP

- Um job periódico compara pedidos com status `PENDING` (ou `PROCESSING`) há
  mais tempo do que o esperado com o status real no ERP (via consulta
  direta, já que temos acesso de leitura ao banco do ERP) e:
  - se o ERP confirma o faturamento → marca o pedido como `CONFIRMED` e
    debita o estoque definitivamente (caso ainda não tenha sido feito).
  - se o ERP não tem registro nenhum após um tempo razoável → marca o
    pedido como falho e libera a reserva de estoque.
- Esse job é a rede de segurança para os casos em que a resposta do ERP se
  perde no caminho (rede, timeout, instabilidade) mas a operação
  efetivamente aconteceu (ou não) do lado do ERP.

---

## Pergunta 4 — Contrato de API e modelo de erros

### `POST /orders`

**Headers**
```
Content-Type: application/json
Idempotency-Key: <string única por tentativa de compra, gerada pelo cliente>
```

**Payload de entrada**
```json
{
  "productId": "cap-001",
  "quantity": 2
}
```

**Sucesso — pedido confirmado imediatamente**
`201 Created`
```json
{
  "orderId": "7400c4a2-8584-4a73-9bd4-5b07d0d9a290",
  "status": "CONFIRMED",
  "productId": "cap-001",
  "quantity": 2,
  "createdAt": "2026-09-13T16:39:06.368Z",
  "updatedAt": "2026-09-13T16:39:06.834Z"
}
```

**Processamento assíncrono — ERP demorou, pedido aceito e em andamento**
`202 Accepted`
```json
{
  "orderId": "7400c4a2-8584-4a73-9bd4-5b07d0d9a290",
  "status": "PENDING",
  "productId": "cap-001",
  "quantity": 2,
  "createdAt": "2026-09-13T16:39:06.368Z",
  "updatedAt": "2026-09-13T16:39:06.368Z"
}
```
O front-end deve consultar `GET /orders/:id` periodicamente até `status`
mudar para `CONFIRMED` ou `FAILED_TEMPORARY`.

**Erro de validação**
`400 Bad Request`
```json
{
  "errorCode": "VALIDATION_ERROR",
  "message": "quantity é obrigatório, deve ser um inteiro entre 1 e 50.",
  "retryable": false
}
```
Front-end: exibir a mensagem junto ao campo inválido; não oferecer retry
automático (o usuário precisa corrigir a entrada).

**Produto inexistente**
`404 Not Found`
```json
{
  "errorCode": "PRODUCT_NOT_FOUND",
  "message": "Produto não encontrado.",
  "retryable": false
}
```

**Estoque insuficiente**
`409 Conflict`
```json
{
  "errorCode": "INSUFFICIENT_STOCK",
  "message": "Estoque insuficiente para concluir a compra.",
  "retryable": false,
  "orderId": "92dd3da1-a4a1-44e6-af90-e4c8b3a347f3"
}
```
Front-end: informar que o item esgotou (ou que a quantidade pedida excede o
disponível) e atualizar a vitrine com o estoque real; não oferecer retry
(tentar de novo não vai criar estoque).

**Falha temporária do ERP / processamento**
`503 Service Unavailable`
```json
{
  "errorCode": "ERP_UNAVAILABLE",
  "message": "Falha temporária ao confirmar o pedido no ERP.",
  "retryable": true,
  "orderId": "..."
}
```
Front-end: exibir mensagem de falha temporária com botão "Tentar novamente",
reaproveitando a mesma `Idempotency-Key` seria incorreto aqui *se* a reserva
já foi liberada (que é o caso) — então esse retry deve gerar uma **nova**
tentativa (nova `Idempotency-Key`), pois é efetivamente uma nova compra.

**Erro inesperado**
`500 Internal Server Error`
```json
{
  "errorCode": "INTERNAL_ERROR",
  "message": "Erro interno inesperado.",
  "retryable": true
}
```

### `GET /orders/:id`

`200 OK` com o mesmo formato do pedido, ou `404 Not Found` com
`errorCode: "ORDER_NOT_FOUND"` se o id não existir.

### Resumo — como o front-end deveria reagir

| Situação | HTTP | `retryable` | Ação no front-end |
|---|---|---|---|
| Sucesso | 201 | — | Mostrar confirmação |
| Processando | 202 | — | Mostrar "confirmando..." e fazer polling |
| Validação | 400 | false | Mostrar erro perto do campo, sem retry automático |
| Produto/pedido não encontrado | 404 | false | Mensagem genérica, recarregar dados |
| Estoque insuficiente | 409 | false | Avisar indisponibilidade, atualizar estoque exibido |
| Falha temporária do ERP | 503 | true | Oferecer "tentar novamente" (nova tentativa) |
| Erro interno | 500 | true | Oferecer "tentar novamente" |

---

## Pergunta 5 — Testes e estratégia de validação

### Testes unitários
- Regras da reserva de estoque isoladas do HTTP: reservar com sucesso,
  reservar além do disponível (deve falhar), confirmar reserva (debita
  definitivamente), liberar reserva (devolve ao disponível), produto
  inexistente.
- Validação de payload do checkout (quantidade zero/negativa/não-inteira,
  productId ausente).
- *(Implementado em `backend/src/stock/stock.service.spec.ts`.)*

### Testes de integração da API
- Fluxo completo de `POST /orders` batendo na API real (via supertest): 400
  para payload inválido, 404 para produto inexistente, 409 para estoque
  zerado, 201/202/503 para os desfechos possíveis do ERP simulado.
- Idempotência: duas chamadas com a mesma `Idempotency-Key` devem retornar o
  mesmo `orderId`.
- `GET /orders/:id`: pedido existente retorna seu status atual; pedido
  inexistente retorna 404.
- *(Implementado em `backend/test/app.e2e-spec.ts`.)*

### Testes de contrato entre front-end e back-end
- Não implementados neste mini-projeto por tempo, mas a estratégia seria:
  gerar um schema (ex: JSON Schema ou OpenAPI) a partir dos tipos
  TypeScript compartilhados (ou um pacote `@casecellshop/contracts`
  publicado internamente), e validar tanto as respostas do back-end quanto
  as chamadas do front-end contra esse schema em CI — evita que uma mudança
  no formato do erro, por exemplo, quebre o front sem ninguém perceber.

### Cenários de concorrência / múltiplas tentativas
- Teste que dispara duas requisições de compra simultâneas
  (`Promise.all`) para um produto com estoque = 1, e verifica que
  exatamente uma recebe sucesso e a outra recebe `409 INSUFFICIENT_STOCK`
  — *(implementado)*.
- Próximo passo natural: um teste de carga (ex: k6 ou autocannon) disparando
  dezenas de requisições concorrentes contra o mesmo produto, para validar
  que o total vendido nunca excede o estoque inicial sob volume maior.

### Testes de estados do front-end
- Não automatizados neste projeto, mas a estratégia seria usar React
  Testing Library para simular:
  - clique no botão de compra desabilita o botão e mostra loading;
  - resposta 201 mostra mensagem de sucesso;
  - resposta 409 mostra mensagem de estoque insuficiente e não trava a UI;
  - resposta 202 mantém um estado "processando" e dispara o polling
    (mockando `fetch` para simular a transição de `PENDING` para
    `CONFIRMED`);
  - resposta 503 mostra o botão "tentar novamente" e uma nova tentativa gera
    uma nova `Idempotency-Key`.

### O que eu automatizaria agora vs. o que deixaria documentado
- **Automatizaria agora** (e automatizei): regras de estoque/concorrência e
  contrato da API de checkout — é onde mora o maior risco financeiro e de
  confiabilidade do sistema.
- **Deixaria documentado como próximo passo**: testes de contrato
  front/back formalizados, testes de componente no front-end, e testes de
  carga/concorrência em escala maior (dezenas/centenas de requisições
  simultâneas, múltiplos produtos).

---

## Pergunta 6 — Uso de IA no desenvolvimento

**Tipos de prompt que eu usaria:**
- Prompts de *design de solução*: descrever o problema e pedir 2-3
  alternativas de arquitetura com trade-offs, para comparar com meu próprio
  raciocínio antes de decidir.
- Prompts de *implementação pontual*: gerar um trecho de código específico
  (ex: "escreva um teste que dispare duas requisições concorrentes com
  supertest") depois que a lógica de negócio já está definida por mim.
- Prompts de *revisão*: pedir para a IA apontar buracos de concorrência,
  casos de erro não tratados, ou inconsistências no contrato de API que eu
  possa ter deixado passar.

**O que eu delegaria / não delegaria:**
- Delegaria: boilerplate (configuração de projeto, testes repetitivos,
  CSS/layout simples, documentação a partir de decisões já tomadas por mim).
- Não delegaria sem revisão extremamente cuidadosa: a lógica central de
  concorrência e atomicidade da reserva de estoque, e o modelo de erros da
  API — são pontos onde um erro sutil (ex: um `await` no lugar errado
  quebrando a atomicidade) tem impacto financeiro direto e é fácil de não
  perceber só lendo o código superficialmente.

**Como eu verificaria se a resposta está correta:**
- Testes automatizados são o principal critério: se a IA sugere uma solução
  para concorrência, por exemplo, eu escrevo (ou peço) um teste que
  realmente dispare requisições concorrentes e confirme o comportamento,
  em vez de confiar na explicação textual da IA.
- Leitura linha a linha do trecho crítico (reserva de estoque, idempotência,
  timeout do ERP) prestando atenção especial a onde exatamente estão os
  `await` — é ali que bugs de concorrência costumam se esconder.
- Rodar cenários manualmente (como fiz via `curl` durante o desenvolvimento
  deste projeto) para confirmar o comportamento real, não só o esperado.

**Riscos de aceitar uma sugestão de IA sem revisão:**
- Código que "parece" atômico mas não é (ex: `await` entre a leitura e a
  escrita do estoque, reintroduzindo a race condition que o case pede para
  resolver).
- Tratamento de erro incompleto (ex: esquecer de liberar a reserva de
  estoque em um caminho de falha específico), que só aparece em produção sob
  carga real.
- Contrato de API inconsistente entre partes diferentes do código gerado em
  momentos diferentes (ex: um endpoint retornando `error` e outro
  `errorCode` para o mesmo tipo de falha).
- Excesso de confiança: como a IA explica bem o próprio código, é fácil
  aceitar uma solução plausível sem de fato validar contra os requisitos
  reais do negócio (neste case: nunca vender sem estoque, nunca duplicar
  pedido).

Registrei os prompts mais relevantes usados neste projeto em
[`PROMPTS.md`](../PROMPTS.md).
