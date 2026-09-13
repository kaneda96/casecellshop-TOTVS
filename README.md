# CaseCellShop — Mini Checkout (Desafio Técnico Pleno)

Implementação de um fluxo fullstack de checkout de capinhas de celular, feito para o
desafio técnico da CaseCellShop. Foco em consistência de estoque, idempotência e
resiliência a falhas do ERP — os 3 problemas descritos no case.

Stack: **NestJS + TypeScript** (back-end, dados em memória) e
**React + TypeScript + Bootstrap** (front-end, empacotado com Vite). Sem
autenticação, sem pagamento real, sem Docker obrigatório — tudo roda local
com `npm install && npm run dev`/`start:dev`.

## Estrutura

```
casecellshop-checkout/
├── backend/     API NestJS (produtos, checkout, status do pedido, Swagger, logs)
├── frontend/    SPA React + Bootstrap (vitrine + fluxo de compra)
├── docs/        Respostas conceituais (Parte 1.A) e diagrama de arquitetura
└── PROMPTS.md   Prompts de IA usados durante o desenvolvimento
```

Cada app tem seu próprio README com instruções detalhadas e o checklist
"O que esperamos observar na entrega" do desafio, mapeado para o código:
[`backend/README.md`](backend/README.md) e [`frontend/README.md`](frontend/README.md).

## Como rodar (resumo)

Requisitos: Node.js 18+ e npm.

```bash
# Backend (porta 3001)
cd backend
npm install
npm run start:dev

# Frontend (porta 5173), em outro terminal
cd frontend
npm install
npm run dev
```

- API: `http://localhost:3001`
- Documentação interativa (Swagger): `http://localhost:3001/docs`
- Front-end: `http://localhost:5173`

Testes do backend:

```bash
cd backend
npm test          # unitários
npm run test:e2e  # end-to-end (sobe a aplicação real via Supertest)
```

Detalhes completos de cada app (variáveis de ambiente, build de produção,
estrutura de pastas) estão nos READMEs de [`backend/`](backend/README.md) e
[`frontend/`](frontend/README.md).

## O que a demo cobre

- Listagem de produtos com estoque em tempo real.
- Compra com quantidade configurável, botão desabilitado durante o
  processamento (evita duplo clique) e mensagens de loading distintas.
- Tratamento visual para: sucesso, estoque insuficiente, entrada inválida e
  falha temporária do ERP (com opção de "Tentar novamente").
- Quando o "ERP" simulado demora, o back-end responde `202 PENDING`
  imediatamente e o front-end faz *polling* em `GET /orders/:id` até o
  pedido ser confirmado ou falhar.
- Duas compras simultâneas do último item do estoque: só uma reserva com
  sucesso (coberto por teste unitário e por teste E2E).
- Idempotência: reenviar a mesma requisição de checkout com o mesmo header
  `Idempotency-Key` nunca cria um segundo pedido.
- Documentação interativa da API via Swagger, e logs estruturados em
  arquivo (`backend/logs/`), além do console.

## Decisões técnicas (resumo)

- **Estoque em memória com "reserva" separada de "confirmação"**: cada
  produto tem `stock` (o que existe) e `reserved` (comprometido em pedidos
  em processamento). A reserva é feita de forma **síncrona** (sem `await`
  no meio), o que no Node.js garante atomicidade mesmo sob concorrência —
  é isso que evita vender a mesma última unidade duas vezes. Detalhes na
  [Pergunta 3](docs/RESPOSTAS.md#pergunta-3).
- **Idempotência via header `Idempotency-Key`**: registrada no mesmo trecho
  síncrono da reserva de estoque, então duas requisições concorrentes com a
  mesma chave nunca reservam estoque duas vezes.
- **Timeout local no checkout**: o back-end nunca espera mais que ~2s pelo
  "ERP" simulado; se estourar, responde `202 PENDING` e resolve de forma
  assíncrona, com o front-end fazendo polling do status. Resolve o
  problema 03 do case (timeout no checkout = compra perdida).
- **Modelo de erros consistente**: toda resposta de erro tem `errorCode`,
  `message` (amigável) e `retryable`. Contrato completo na
  [Pergunta 4](docs/RESPOSTAS.md#pergunta-4).

## Por que NestJS

Cheguei a implementar a primeira versão em Express puro, e migrei para
NestJS por um motivo específico: **clareza para quem lê o código**, não
necessidade técnica — a garantia de atomicidade da reserva de estoque (o
coração deste desafio) é pura lógica de JavaScript e funciona igual nos
dois frameworks.

O que o Nest traz de concreto para este projeto:
- **Separação explícita em módulos/controllers/providers**
  (`stock/`, `erp/`, `products/`, `orders/`) deixa visível, só pela
  estrutura de pastas, onde mora cada responsabilidade — sem precisar ler o
  código para entender a arquitetura.
- **Validação declarativa** com `class-validator` (`CreateOrderDto`) em vez
  de uma função `validate()` manual — menos código, e a regra de validação
  fica documentada no próprio tipo.
- **Injeção de dependência** deixa os testes mais diretos (dá para
  instanciar cada `Service` isoladamente via `Test.createTestingModule`,
  sem precisar montar um Express inteiro).
- **Swagger de graça**: como o Nest já sabe os tipos de cada DTO/controller,
  gerar documentação interativa (`/docs`) exigiu poucas linhas.

O trade-off é real e vale registrar: mais boilerplate (decorators, módulos,
arquivos) para um projeto que, em Express, cabia em bem menos arquivos. Para
um mini-projeto de avaliação, considero que vale a pena pela legibilidade;
para um script descartável eu não migraria.

## Por que React + Bootstrap

O pedido explícito foi usar algo que já é familiar e fácil de manter no
dia a dia, então troquei o CSS customizado por **Bootstrap** (classes
utilitárias direto no JSX — `card`, `btn`, `badge`, `alert`, `spinner-border`
— sem a camada extra do pacote `react-bootstrap`, que teria uma API própria
para aprender). O resultado é um front-end onde qualquer pessoa que já
conhece Bootstrap reconhece o CSS imediatamente.

### Por que Vite (mesmo sem eu conhecer)

Cogitei recomendar trocar para Create React App (CRA), que é mais conhecido,
mas decidi manter o Vite por dois motivos:

1. **O time do React descontinuou oficialmente o CRA** — não recebe mais
   atualizações e o próprio time recomenda não usá-lo para projetos novos.
   Migrar para uma ferramenta descontinuada seria trocar algo que funciona
   bem por algo em fim de vida.
2. **Manter o Vite não exige "conhecer" o Vite.** No dia a dia, a única
   interação com o empacotador é rodar dois comandos —
   `npm run dev` (desenvolvimento) e `npm run build` (gerar os arquivos
   finais) — exatamente os mesmos dois comandos que o CRA usaria. Não há
   configuração para mexer nem conceito novo para aprender só para manter o
   projeto.

Ou seja: o Bootstrap resolve a familiaridade que você pediu (CSS que você já
lê e escreve), e o Vite continua nos bastidores sem exigir nada de você além
dos dois comandos de sempre.

## Limitações conhecidas / o que não foi feito

- **Persistência**: tudo é em memória; reiniciar o servidor zera estoque e
  pedidos. Em produção seria um banco (Postgres, por exemplo) com uma
  transação real para reserva de estoque (`SELECT ... FOR UPDATE` ou uma
  coluna de versão para optimistic locking), já que múltiplas instâncias do
  backend quebrariam a garantia de atomicidade que hoje depende de rodar em
  um único processo Node.
- **Reconciliação do caso PENDING é simplificada**: quando o checkout
  estoura o timeout, o back-end dispara uma *nova* chamada ao simulador de
  ERP em vez de "escutar" o resultado da chamada original (para manter o
  código simples de ler). Em um sistema real, o ideal seria o ERP notificar
  via webhook/fila, ou um worker de reconciliação consultar o status do
  pedido diretamente no ERP — nunca reprocessar o pedido do zero.
- **Fila/mensageria real**: não usei nenhuma fila (SQS, RabbitMQ) — o "ERP"
  é chamado diretamente (de forma assíncrona e com timeout). Descrevo na
  [Pergunta 2](docs/RESPOSTAS.md#pergunta-2) como isso evoluiria com uma
  fila de verdade.
- **Testes de front-end**: não implementei testes automatizados de
  componentes React (ex: Testing Library) por tempo; descrevi o que seria
  testado e como na [Pergunta 5](docs/RESPOSTAS.md#pergunta-5).
- **Sem autenticação, pagamento ou deploy**, conforme o escopo do desafio.

## Próximos passos (se fosse continuar)

1. Trocar o armazenamento em memória por Postgres, com reserva de estoque
   via transação.
2. Persistir a Idempotency-Key com TTL (ex: Redis) em vez de um `Map` em
   memória.
3. Endpoint/worker de reconciliação real (comparar pedidos `PENDING` há
   mais de N minutos com o status real no ERP).
4. Testes de componente no front-end (Testing Library).
5. Correlacionar o `requestId` do backend de ponta a ponta (front-end
   também logando/enviando o mesmo id).

## Documentação completa

- [docs/RESPOSTAS.md](docs/RESPOSTAS.md) — as 6 perguntas conceituais da
  Parte 1.A (diagnóstico dos 3 problemas, arquitetura alvo incremental,
  estoque/concorrência/idempotência, contrato de API, estratégia de testes,
  uso de IA).
- [docs/DIAGRAMA.md](docs/DIAGRAMA.md) — diagrama (Mermaid) da arquitetura
  alvo.
- [backend/README.md](backend/README.md) — setup, estrutura e checklist de
  entrega do back-end.
- [frontend/README.md](frontend/README.md) — setup, estrutura e checklist
  de entrega do front-end.
- [PROMPTS.md](PROMPTS.md) — prompts de IA usados no desenvolvimento.
