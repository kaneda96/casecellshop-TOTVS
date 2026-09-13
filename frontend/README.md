# Frontend — CaseCellShop Checkout (React + Bootstrap)

SPA em **React + TypeScript**, com **Bootstrap** para estilo (sem
`react-bootstrap`; só classes CSS utilitárias do Bootstrap direto no JSX,
que é a forma mais simples de usar e de dar manutenção sem aprender uma API
nova). Empacotado com **Vite** — ver o porquê em
[`../README.md`](../README.md#por-que-vite-mesmo-sem-eu-conhecer).

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

- Sem testes automatizados de componente (Testing Library) — estratégia
  descrita na Pergunta 5 de [`../docs/RESPOSTAS.md`](../docs/RESPOSTAS.md).
- Sem gerenciamento de estado global (Redux/Zustand) — desnecessário para o
  escopo de uma tela só; `useState` local resolve.
- Layout propositalmente simples (o desafio não pede design elaborado).
