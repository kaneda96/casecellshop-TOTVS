# Parte 1.A — Respostas Conceituais

## Pergunta 1 — Diagnóstico e trade-offs

### 01 | Performance da vitrine

- **O que você acredita estar causando o problema?**
O ERP não é feito para atender catálogo de e-commerce em alta demanda, e a loja o consulta a todo momento.
Isso causa lentidão para o usuário e também impacta outras áreas como financeiro e contábil, que competem pelos mesmos recursos.

- **Qual é o impacto para o cliente e para o negócio?**
Para o cliente: abandono da jornada devido à lentidão.
Para o negócio: perda de conversão e sobrecarga do ERP, que fica lento para outras áreas que utilizam o ERP.

- **Quais seriam pelo menos 2 caminhos possíveis de solução?**

1. **Criar um esquema de paginação na consulta do banco de dados do ERP**
   Acredito que seja a forma mais simples de mitigar esse problema em curto prazo, limitando quantos produtos voltam por requisição. Pode trazer um alívio para a aplicação em um momento de extrema urgência.
  ***Trade-off***: Não resolve a causa raiz do problema, ainda há muita demanda para o ERP que realiza a função de e-commerce e isso não é o adequado, porque compete com faturamento e contabilidade pelos mesmos recursos.

2. **Criar um cache simples para a visualização da vitrine com Redis**
  Seria interessante criar um cache para a visualização dos itens da vitrine com Redis, que
  é uma estratégia mais simples, mas pode dar muita inconsistência dependendo do tempo de refresh dele.
  ***Trade-off***: Em cache miss, ainda é necessário consultar o ERP para repopular o cache. Se muitas requisições chegarem no momento da expiração, pode gerar um pico de chamadas ao ERP (cache stampede)

3. **Criar uma API própria para essa página de vendas e um banco de dados próprio atualizado por um job**
  Para a solução mais robusta e mais recomendada, seria uma nova API que retirasse essa responsabilidade do ERP e criasse uma cópia de dados em um banco local, específico para a loja. Essa cópia seria atualizada a partir do banco do ERP por um job agendado, que roda de forma independente do BFF, a cada 5 minutos. A loja lê apenas do banco local, nunca do ERP em tempo real. O job usa lock distribuído para evitar execução duplicada se houver múltiplas instâncias.
  ***Trade-off:*** A implementação pode demorar mais devido à criação da estrutura da nova API e também depende da estrutura de dados do ERP. Exemplo: precisaria de um campo como updated_at para saber a data da última atualização do anúncio, e usá-lo como base para a consulta do job. Além disso, depende do escopo dos responsáveis pela implementação.


**Priorização:** Na minha opinião, eu priorizaria a opção número 3. O ERP é sobrecarregado de requisições e ele precisa o quanto antes ser separado para não afetar as outras áreas da empresa que dependem dele.

---

### 02 | Consistência de estoque

- **O que você acredita estar causando o problema?**
O problema principal seria a concorrência no estoque. A loja lê o saldo de estoque no ERP enquanto muitos outros usuários realizam compras simultâneas, o que pode gerar uma informação falsa de saldo de estoque e possibilita uma compra sem produto.

- **Qual é o impacto para o cliente e para o negócio?**
- Cliente: A página possibilita uma compra sem saber o número exato do produto disponível.
- Negócio: Gera custo operacional para a empresa devido ao processo de suporte e risco de reputação.

- **Quais seriam pelo menos 2 caminhos possíveis de solução?**

  1. **Reserva de estoque no carrinho de compras** Ao incluir o produto no carrinho de compras, é inserido um token em uma tabela auxiliar e reservado o estoque nesse momento. Feito isso, o cliente consegue verificar no exato momento se ainda há estoque disponível ou não, sem passar pelo checkout, o que não sobrecarrega o checkout.
      ***Trade-off:*** Esse formato pode causar uma reserva de estoque, inviabilizando outra compra por um curto período de tempo. Também aumenta a complexidade da solução, devido à criação de um job que realiza a varredura nessa tabela e devolve o estoque em caso de abandono. Em caso de remoção do carrinho, a API libera a reserva na hora.

  2. **Reserva de estoque com banco de dados** No momento da finalização da compra a aplicação faz um update em um campo auxiliar no banco de dados indicando que existe um produto reservado e não é possível continuar com a compra caso ela esteja com estoque insuficiente.
    ***Trade-off:*** Requer o desenho de uma solução auxiliar em caso de desistência ou expiração do pedido como um job de expiração, rodando em processo separado do BFF. O que retorna o estoque em seu número original.

  3. **Fila de pedidos processada sequencialmente por produto** Após a finalização da compra, o cliente recebe um 202 (Accepted) informando que o pedido foi recebido e está "Em processamento". Uma fila particionada por  produto_id processa os pedidos um por vez: consulta o estoque, verifica se há quantidade suficiente, e reserva. Se houver estoque, o pedido segue para pagamento. Se não houver, o pedido é marcado como REJEITADO e o cliente é notificado.
    ***Trade-off:*** Requer o desenho de uma solução auxiliar em caso de desistência ou expiração do pedido como um job de expiração, requer ajuste da parte de negócios (UX) devido ao status de "em processamento" e possui uma alta latência de acordo com a demanda (o cliente espera na fila).


- **Priorização:** Acredito que eu usaria a opção 1 ou 2 devido a uma maior consistência na informação do estoque e permite ao usuário realizar uma ação consistente no sistema em tempo real, mesmo que isso inviabilize algumas compras por um curto período de tempo. Uma outra alternativa também seria mesclar algumas soluções, por exemplo: a
---

### 03 | Resiliência do checkout

**Causa provável:** O checkout chama o ERP de forma síncrona e espera a resposta para confirmar o pedido. Quando o ERP demora mais que o timeout, a requisição falha para o cliente mas o pedido pode ter sido criado parcialmente no ERP. Não há retry, nem idempotência, nem desacoplamento. O problema de fundo é que o ERP não foi feito para responder a milhares de checkouts simultâneos com baixa latência.

**Impacto:**
- Cliente: acha que a compra falhou, tenta de novo ou desiste. Em ambos os casos, a experiência é ruim.
- Negócio: perda de vendas por timeout, risco de cobrança duplicada se o
  cliente tentar de novo e aumento de chamados de suporte.

**Caminhos possíveis:**
  1. **Serviço de faturamento dedicado + fila + WebSocket**: 
    A criação de um serviço específico para gerar o faturamento da loja e desacoplar essa responsabilidade do ERP. O ERP é um monolito e não foi feito para responder a milhares de checkouts simultâneos. Ele irá continuar existindo, mas para processos mais focados no interior da empresa. O fluxo: a API recebe o pedido, enfileira e responde 202 Accepted. Um worker consome a fila e chama o serviço de faturamento. Quando o processamento termina, o servidor notifica o cliente via WebSocket. Feito isso, dá para fazer um escalonamento com load balancer e dar uma dinâmica maior para a escalabilidade. É a solução mais robusta.
   - Trade-off: exige a criação de um novo serviço de faturamento e aumenta muito a complexidade para implementar e manter serviços.

  2. **Fila no momento do checkout no Próprio ERP**: Seria uma solução mais conservadora, sem desacoplar o ERP. É mais simples de implementar, porém o ERP ainda irá sofrer uma carga muito grande com o número de requisições. A fila serializa as operações, mas o ERP continua processando todas as requisições, apenas uma de cada vez.
   ***Trade-off:*** Resolve de forma rápida o problema, mas não tira a sobrecarga do ERP. O usuário pode não ter confirmação imediata no checkout, e pode haver uma demora para concluir o processo de compra.

  3. **Transactional Outbox + cópia de banco para leitura** Essa aqui consiste na criação de instancias cópia do banco de dados do ERP para a leitura e a criação de uma implementação semelhante a fila. Primeiro é criado uma transação na API para gravar o pedido como "PENDENTE" e depois uma linha para "enfileirar" o processamento em uma tabela auxiliar (ex: PedidoCriado) que seria a outbox um outro serviço realiza a leitura desses eventos e manda para o ERP ao concluir o pedido é marcado como processado. 
  ***Trade-off:*** Adiciona latência e ainda é necessário realizar a criação desse serviço de integração da tabela de eventos e o ERP

**Priorização:** Acho que a opção 3 é a opção mais acessivel no curto prazo, mas a mais robusta é a 1. A opção 2 é boa mas ainda cria uma depencia grande do ERP e pode gerar interferência em outros processos internos dos quais o ERP é responsável.

---

## Pergunta 2 — Arquitetura alvo incremental

### Componentes principais

- **Loja (BFF/API própria da loja):** camada que o front-end consome. Nunca
  chama o ERP diretamente numa jornada crítica do cliente.
- **Banco de leitura da loja:** cópia local de produtos/preços/estoque,
  otimizada para leitura, populada por sincronização a partir do ERP.
- **Cache (Redis ou em memória):** na frente do banco de leitura, para os
  produtos mais acessados (reduz ainda mais a latência da vitrine).
- **Fila de pedidos/eventos (ex: RabbitMQ, SQS,tabela de outbox):**
  desacopla o checkout do processamento síncrono no ERP.
- **Workers de sincronização:** dois sentidos —
  - ERP → Loja: job/CDC que replica catálogo, preço e estoque do MySQL do
    ERP para o banco da loja (leitura), em intervalos curtos (segundos a
    poucos minutos).
  - Loja → ERP: worker que consome a fila de pedidos confirmados e envia o
    faturamento para o ERP, com retry e backoff.

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
  que o total vendido nunca excede o estoque inicial sob volume maior.]

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
