@AGENTS.md

# Bússola: notas para quem mexe no código

- Finanças pessoais do Daniel, repositório público. NUNCA commitar dado real: extratos, `.env*`, prints com número real. `dados/` e `*.ofx|csv|pdf` já estão no .gitignore.
- Banco: Postgres via `pg` com SQL direto em `lib/queries.ts`. Migração aditiva e idempotente em `scripts/migrate.ts` (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS). Nunca reescrever tabela.
- Tipos do `pg`: DATE volta como string ISO e NUMERIC como number (parsers em `lib/db.ts`). Não use `new Date(dateString)` para datas de transação; use `lib/dates.ts`.
- Sinal: negativo sai, positivo entra. `kind` decide se entra no gráfico (`expense`/`income`) ou não (`transfer`).
- Cartão: `invoice_month` é o mês em que a fatura FECHA (`invoiceMonthFor`). Ao mudar dia de fechamento, `recomputeInvoices`.
- Conciliação (`lib/reconcile.ts`): match = mesmo valor, mesmo sinal, data até 4 dias; fitid repetido = ignorado; sem par = `imported` com `reviewed=false`.
- Chat: `lib/chat/local.ts` responde sem IA (modo padrão); `lib/chat/tools.ts` + `app/api/chat` usam o Claude só com `ANTHROPIC_API_KEY`. O resto do sistema não pode depender de IA.
- Orçamento (`lib/budget.ts`): limite do grupo = % × base (renda configurada > receita do mês > média 3m). Gasto ligado a viagem (e não pré-pago) fica FORA dos grupos.
- Viagens (`lib/trips.ts`): `createTransaction` liga o gasto à viagem ativa na data, exceto categoria `fixed`; `tripId: null` explícito impede. `trip_excluded` = pré-pago, fora do teto.
- Auth: `proxy.ts` valida o selo do cookie (iron-session, ttl = maxAge = 30 dias) e TODA página em `app/(app)` chama `requireSession()` (numa navegação suave o layout não roda). Login tem freio por IP em `login_attempts`.
- "Hoje" é sempre `todayISO()`/`todayDay()` de `lib/dates.ts` (fuso America/Sao_Paulo); nunca `new Date().getDate()` no servidor (Vercel é UTC).
- Parcelas: a fatura é a da 1ª parcela + i meses (`createTransaction`), não recalculada da data clampada.
- Importação: linha sem FITID ganha id sintético `h:<sha1>` (reimportar CSV não duplica); FITID repetido no arquivo vira "duplicate".
- Tema: `public/theme-boot.js` (beforeInteractive) + `data-theme` no `<html>`; tokens escuros duplicados em `globals.css` (media query e data-theme).
- Copy em português, primeira pessoa quando fizer sentido, sem travessão.
- Dev local sem Postgres: `npm run db:local` (PGlite na porta 5433) + `.env.local` apontando pra ele.
