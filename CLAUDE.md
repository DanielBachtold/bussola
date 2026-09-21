@AGENTS.md

# Bússola: notas para quem mexe no código

- Finanças pessoais do Daniel, repositório público. NUNCA commitar dado real: extratos, `.env*`, prints com número real. `dados/` e `*.ofx|csv|pdf` já estão no .gitignore.
- Banco: Postgres via `pg` com SQL direto em `lib/queries.ts`. Migração aditiva e idempotente em `scripts/migrate.ts` (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS). Nunca reescrever tabela.
- Tipos do `pg`: DATE volta como string ISO e NUMERIC como number (parsers em `lib/db.ts`). Não use `new Date(dateString)` para datas de transação; use `lib/dates.ts`.
- Sinal: negativo sai, positivo entra. `kind` decide se entra no gráfico (`expense`/`income`) ou não (`transfer`).
- Cartão: `invoice_month` é o mês em que a fatura FECHA (`invoiceMonthFor`). Ao mudar dia de fechamento, `recomputeInvoices`.
- Conciliação (`lib/reconcile.ts`): match = mesmo valor, mesmo sinal, data até 4 dias; fitid repetido = ignorado; sem par = `imported` com `reviewed=false`.
- Chat com IA é opcional e só existe com `ANTHROPIC_API_KEY`. O resto do sistema não pode depender dele.
- Copy em português, primeira pessoa quando fizer sentido, sem travessão.
- Dev local sem Postgres: `npm run db:local` (PGlite na porta 5433) + `.env.local` apontando pra ele.
