# PROMPTS.md

Prompts mais relevantes usados com IA (Claude) durante o desenvolvimento,
como pedido no enunciado. Todo código sugerido foi revisado e validado por
teste automatizado ou execução manual antes de entrar no projeto.

1. **Arquitetura incremental** — "Dado um checkout com vitrine lenta (ERP
   síncrono), venda concorrente sem controle de estoque, e timeout no
   checkout, proponha uma arquitetura incremental para reduzir a
   dependência do ERP, priorizada em 30/60/90 dias." Usei como ponto de
   partida e ajustei a priorização com meu próprio critério (maior risco
   financeiro primeiro).

2. **Atomicidade da reserva de estoque em Node.js** — "Como garantir que
   duas requisições concorrentes nunca reservem a mesma última unidade em
   memória, sem banco de dados?" Confirmei a resposta (função síncrona sem
   `await` no meio) escrevendo um teste que dispara duas reservas em
   sequência e valida que só uma tem sucesso.

3. **Timeout do checkout sem perder a compra** — "Como responder rápido a
   um checkout mesmo se uma chamada externa demorar, usando
   `Promise.race`?" Adaptei ao modelo de status do pedido
   (`PENDING`/`CONFIRMED`/`FAILED_TEMPORARY`) e documentei no README a
   simplificação assumida na reconciliação em background.

4. **Migração para NestJS** — "Como estruturar este backend Express (com
   reserva de estoque, idempotência e timeout de ERP) em módulos NestJS,
   mantendo o mesmo contrato de API?" Reorganizei em `stock/`, `erp/`,
   `products/`, `orders/`, e critiquei a sugestão inicial (que tinha o
   estoque como um provider global desnecessariamente complexo) para o
   design mais simples que está no repositório.

5. **Testes E2E com NestJS + Supertest** — "Como escrever testes e2e no
   Nest que cubram validação, idempotência e concorrência, subindo a
   aplicação real?" Validei rodando os 12 testes e conferindo que cada
   cenário (400/404/409/503/idempotência/concorrência) realmente falha
   quando eu quebro a lógica de propósito.

6. **Revisão do contrato de erros** — Pedi uma revisão crítica do formato
   de erro (`errorCode`/`message`/`retryable`) para garantir consistência
   entre todos os endpoints antes de fechar a Pergunta 4.

**Como validei:** nenhuma sugestão sobre concorrência ou atomicidade foi
aceita sem um teste automatizado confirmando o comportamento; os fluxos
também foram testados manualmente via `curl` durante o desenvolvimento.

**Risco que fico mais atento:** código que parece atômico mas não é (ex: um
`await` no lugar errado entre a leitura e a escrita do estoque) — é o tipo
de bug que passa despercebido numa leitura rápida e só aparece sob carga
real.
