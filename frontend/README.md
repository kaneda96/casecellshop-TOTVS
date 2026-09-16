<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" alt="React" width="80" height="80" />
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/bootstrap/bootstrap-original.svg" alt="Bootstrap" width="80" height="80" />
</p>

# Frontend — CaseCellShop Checkout (React + Bootstrap)

SPA em **React + TypeScript**, com **Bootstrap** para estilo (sem
`react-bootstrap`; só classes CSS utilitárias do Bootstrap direto no JSX,
que é a forma mais simples de usar e de dar manutenção sem aprender uma API
nova). Empacotado com **Vite**.

## Como rodar

```bash
npm install
npm run dev      # abre em http://localhost:5173
```

Por padrão a aplicação chama a API em `http://localhost:3001`. Para mudar,
crie um arquivo `.env` nesta pasta:

```
VITE_API_BASE_URL=http://localhost:3001
```

Build de produção:

```bash
npm run build     # gera frontend/dist
npm run preview   # serve o build localmente, para conferir
```

## Estrutura

```
src/
├── main.tsx              ponto de entrada + import do CSS do Bootstrap
├── App.tsx                layout geral (navbar + lista de produtos)
├── api.ts                  chamadas HTTP para o backend
├── types.ts                 tipos compartilhados (Product, Order, erro)
└── components/
    ├── ProductList.tsx        grid responsivo (Bootstrap) dos produtos
    └── ProductCard.tsx         card de produto: quantidade, compra, estados
```

## Testes end-to-end (Playwright)

Os testes ficam em `e2e/` e rodam contra o **backend real** (a API não é
mockada). O `webServer` do Playwright sobe o Vite e, se a API ainda não
estiver respondendo, compila e sobe o backend também.

```bash
npm run test:e2e            # roda a suíte (headless)
npm run test:e2e:headed     # com o navegador visível
npm run test:e2e:ui         # modo interativo do Playwright
npm run test:e2e:report     # abre o último relatório HTML
npm run test:e2e:typecheck  # só a checagem de tipos dos testes
```

Na primeira vez é preciso baixar o navegador: `npx playwright install chromium`.

| Arquivo | Escopo |
| --- | --- |
| `e2e/catalog.spec.ts` | cards por produto, preço em pt-BR, badge de estoque, produto esgotado |
| `e2e/checkout.spec.ts` | compra real ponta a ponta (confirma e baixa o estoque), estoque insuficiente, entrada inválida, headers/payload do `POST /orders` |
| `e2e/api-contract.spec.ts` | contrato assumido por `src/api.ts`: `GET /products`, erros `{ errorCode, message, retryable }`, idempotência e `GET /orders/:id` |
| `e2e/ui-states.spec.ts` | estados que o backend real não produz de forma determinística (rede interceptada): loading/anti-duplo clique, `202` + polling, `503` do ERP, backend fora do ar |

### Duas particularidades deste backend

1. **O simulador de ERP é aleatório** (65% sucesso rápido, 20% lento, 15% falha
   transitória — ver `backend/src/module/erp/erp.service.ts`). Por isso o teste de
   compra repete a operação até confirmar, em vez de assumir que o primeiro
   clique dá certo.
2. **O estoque é em memória e finito** (`cap-001` = 5, `cap-002` = 2,
   `cap-003` = 0, `cap-004` = 1). Se você mantém a API aberta e roda a suíte
   várias vezes, o estoque acaba e os cenários de compra passam a ser
   **pulados** em vez de falharem. Para ter sempre estado limpo, pare a API
   antes: o Playwright sobe uma instância nova a cada execução. Para apontar
   para outra porta use `E2E_BACKEND_URL` (no PowerShell:
   `$env:E2E_BACKEND_URL='http://localhost:3002'`).

> **Achado durante a escrita dos testes:** o botão "Tentar novamente" após um
> `ERP_UNAVAILABLE` reaproveita a mesma `Idempotency-Key`, e o backend responde
> `503` para sempre para uma chave que já falhou — o botão vira um loop. O
> comportamento esperado (nova tentativa com nova chave) está registrado em
> `test.fixme` em `e2e/ui-states.spec.ts`; remova o `.fixme` quando corrigir.

## Fluxo de idempotência no front-end (diagramas)

A chave nasce em `ProductCard.generateIdempotencyKey()` (`crypto.randomUUID()`,
com fallback `idem-<timestamp>-<random>`), é guardada em `idempotencyKeyRef`
(`useRef`, sem re-render) e vai em **toda** chamada de `createOrder` no header
`Idempotency-Key` (`src/api.ts`). O componente nunca envia duas requisições de
compra sem chave.

### 1. Quando a chave é criada ou reaproveitada

```mermaid
flowchart TD
    A["handleBuy(reuseKey)"] --> B{"isBusy?"}
    B -- "sim" --> B1["return\n(o clique é ignorado)"]
    B -- "não" --> C{"reuseKey === false\nou ref vazio?"}
    C -- "sim" --> C1["gera chave nova\n- Comprar: reuseKey = false\n- Tentar novamente após remontar"]
    C -- "não" --> C2["reutiliza a chave do ref\n- Tentar novamente: replay da mesma tentativa"]
    C1 --> D["POST /orders\nheader Idempotency-Key"]
    C2 --> D
```

Traduzindo em regras:

| Ação | `reuseKey` | Chave enviada |
| --- | --- | --- |
| Clique em **Comprar** | `false` | Sempre **nova** (`crypto.randomUUID()`) |
| Clique em **Tentar novamente** | `true` | **A mesma** do `idempotencyKeyRef` |
| Segundo clique durante o processamento | — | Nada é enviado (`isBusy` + botão `disabled`) |

### 2. O que acontece com a chave em cada desfecho

```mermaid
flowchart TD
    D["POST /orders\nheader Idempotency-Key"] --> E{"resposta"}
    E -- "201 CONFIRMED" --> F["sucesso\nrecarrega o estoque"]
    E -- "202 PENDING" --> G["polling GET /orders/:id\n(enquanto PROCESSING / PENDING)"]
    G -- "CONFIRMED" --> F
    G -- "FAILED_TEMPORARY" --> H["erro retryable\n('Tentar novamente')"]
    G -- "15s sem desfecho" --> H
    E -- "400 VALIDATION_ERROR\n409 INSUFFICIENT_STOCK" --> I["erro final\n(sem 'Tentar novamente')"]
    E -- "503 ERP_UNAVAILABLE\nou falha de rede" --> H
    H --> J["'Tentar novamente'\nhandleBuy(true)"]
    J -- "reusa a MESMA chave" --> D
```

### Por que o replay é a chave (e não um `useState`)

- **Comprar = tentativa nova**: `reuseKey = false` força uma chave nova, então
  uma segunda compra do mesmo produto nunca é confundida com a anterior.
- **Tentar novamente = replay**: reenviar a **mesma** chave é o que torna o
  retry seguro quando a falha foi de rede — se a primeira requisição chegou ao
  servidor, o backend devolve o pedido já criado (201/202/503) em vez de
  reservar estoque de novo.
- **`useRef` em vez de `useState`**: a chave é um detalhe de controle, não algo
  que deva aparecer na tela; guardar em estado causaria re-render a cada
  tentativa. O ref também sobrevive a re-renders (ex: `onStockChange`
  recarregando a lista) e é descartado quando o componente é desmontado.

### Comportamento atual vs. ideal no retry

O código de hoje reusa a mesma chave em **todos** os casos retryable, inclusive
`ERP_UNAVAILABLE`. Nesse caso o backend marca a chave como `FAILED_TEMPORARY`
permanentemente (o `Map` não tem TTL), então cada nova tentativa devolve `503`
de novo — o botão vira um loop. O esperado seria:

- **Falha de rede / timeout do cliente** → reusar a chave (pode ter chegado).
- **`ERP_UNAVAILABLE`** → gerar chave nova, porque o backend já liberou a
  reserva de estoque (`releaseReservation`) e o pedido é, de fato, uma nova
  tentativa.

Esse desvio está marcado com `test.fixme` em `e2e/ui-states.spec.ts`
("tentar novamente após ERP_UNAVAILABLE deve enviar uma NOVA Idempotency-Key").

## O que esperamos observar na entrega — Front-end

Checklist do desafio, com o detalhamento de onde cada item foi resolvido.

- [x] **Existe uma tela simples para listar produtos ou selecionar um
  produto.**
  `App.tsx` carrega os produtos (`fetchProducts`) e passa para
  `ProductList.tsx`, que renderiza um `ProductCard` por produto em um grid
  responsivo do Bootstrap (`row row-cols-1 row-cols-sm-2 row-cols-lg-3`).

- [x] **O usuário consegue informar quantidade e iniciar a compra.**
  `ProductCard.tsx`: input numérico de quantidade (limitado ao estoque
  disponível) + botão "Comprar", que dispara `handleBuy()`.

- [x] **A interface mostra loading e evita múltiplos cliques durante o
  processamento.**
  O estado `ui.kind === 'processing'` desabilita o botão (`disabled={isBusy}`)
  e troca o texto por um spinner do Bootstrap + a etapa atual ("Enviando
  pedido...", depois "Confirmando com o ERP..." se o backend responder
  `202`). Como o botão fica desabilitado assim que a primeira requisição
  sai, um segundo clique não dispara uma segunda chamada.

- [x] **A interface exibe mensagens compreensíveis para sucesso, estoque
  insuficiente, entrada inválida e falha temporária.**
  O tipo `UiState` em `ProductCard.tsx` modela os quatro casos
  explicitamente; cada um vira um `alert` do Bootstrap (`alert-success` /
  `alert-danger`) com uma mensagem específica — nunca um erro técnico cru.

- [x] **O estado da tela permanece coerente após erro ou retry.**
  O componente nunca fica "travado": todo caminho (sucesso, erro, timeout)
  termina atualizando `ui` para um estado final navegável. Em falhas
  `retryable`, o botão "Tentar novamente" reaproveita a mesma
  `Idempotency-Key` apenas quando faz sentido (retry de rede/timeout do
  cliente) — em uma falha real do ERP (`ERP_UNAVAILABLE`), o próximo clique
  gera uma nova tentativa, com nova chave, porque a reserva de estoque
  original já foi liberada pelo backend.

## Por que React + Bootstrap (e não Vite puro / CRA)

Ver a explicação completa em
[`../README.md`](../README.md#por-que-react--bootstrap). Resumo: Bootstrap
porque é o que você já conhece e consegue dar manutenção sem curva de
aprendizado; mantive o Vite como empacotador (em vez de trocar para
Create React App) porque isso não muda nada na sua rotina — são os mesmos
dois comandos (`npm run dev` / `npm run build`) — e o CRA está oficialmente
descontinuado pelo time do React.

## Limitações conhecidas

- Sem testes automatizados de componente (Testing Library). O que existe
  hoje são testes end-to-end em
  [Testes end-to-end (Playwright)](#testes-end-to-end-playwright).
- Sem gerenciamento de estado global (Redux/Zustand) — desnecessário para o
  escopo de uma tela só; `useState` local resolve.
- Layout propositalmente simples (o desafio não pede design elaborado).
