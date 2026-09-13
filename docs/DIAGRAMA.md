# Diagrama — Arquitetura alvo incremental

Diagrama de referência para a resposta da Pergunta 2. Renderiza automaticamente
no GitHub (blocos ```mermaid).

```mermaid
flowchart LR
    subgraph ERP["ERP (monolito - fonte de verdade financeira)"]
        ERPDB[(MySQL do ERP)]
    end

    subgraph Loja["Loja / novos serviços"]
        SyncJob["Job de sincronização\n(catálogo/estoque)"]
        ReadDB[(Banco de leitura\nda loja)]
        Cache[(Cache - Redis)]
        API["API da loja (BFF)"]
        StockSvc["Serviço de estoque\n(reserva/confirma/libera)"]
        OrdersDB[(Banco de pedidos)]
        Queue[["Fila de faturamento"]]
        Worker["Worker de faturamento"]
        Reconcile["Job de reconciliação"]
    end

    Front["Front-end (vitrine + checkout)"]

    ERPDB -- "CDC / job periódico" --> SyncJob --> ReadDB
    ReadDB --> Cache --> Front

    Front -- "GET /products" --> API --> Cache
    Front -- "POST /orders" --> API
    API --> StockSvc
    StockSvc --> OrdersDB
    API -- "202 Accepted (rápido)" --> Front
    OrdersDB --> Queue --> Worker
    Worker -- "faturamento síncrono" --> ERP
    Worker -- "confirma / libera reserva" --> StockSvc
    Front -- "GET /orders/:id (polling)" --> API --> OrdersDB

    Reconcile -- "compara status" --> ERPDB
    Reconcile -- "corrige" --> OrdersDB
```

**Leitura do fluxo:**
1. O catálogo é sincronizado do ERP para o banco de leitura da loja de forma
   assíncrona (não bloqueia nenhuma requisição de cliente).
2. A vitrine só fala com a API da loja, que serve dados via cache/banco
   próprio — nunca o ERP diretamente.
3. O checkout reserva estoque localmente (atômico), responde rápido ao
   cliente e delega o faturamento real ao ERP via fila/worker.
4. O front-end consulta o status do pedido até ele ser confirmado.
5. Um job de reconciliação garante que divergências entre loja e ERP sejam
   detectadas e corrigidas.

No mini-projeto entregue, a versão "mínima" desse desenho está implementada:
sem fila/worker separados (o processamento assíncrono acontece dentro do
próprio processo da API, com timeout), e sem banco de leitura próprio (o
catálogo já está em memória na loja, já que não há um ERP real para
sincronizar). A estrutura de reserva/confirmação/liberação de estoque e o
padrão de resposta rápida + polling, porém, são os mesmos que essa
arquitetura alvo propõe.
