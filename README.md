# Bússola

Sistema de finanças pessoais para quem quer saber onde o dinheiro está indo sem depender de app de banco nem de planilha. Feito para uso próprio, publicado para servir de base para quem quiser montar o seu.

**O que ele faz**

- **Lançamento rápido, sem IA**: você escreve "almoço 42 crédito rico" ou "mercado 350 em 3x" e o sistema entende valor, conta, parcelas, data e categoria; chips do que você mais repete; a notificação do banco colada também vale. Funciona no celular como app (PWA), com atalho de "compartilhar" direto pra barra de lançar e `?q=...&ok=1` pra um Atalho da Siri.
- **Importação de extrato (OFX, CSV ou PDF)** com conciliação: o que você lançou durante o mês é casado com o extrato; o que veio no extrato e você esqueceu entra numa fila de revisão (um toque no chip categoriza e ensina o padrão, os iguais vão junto); o que você lançou e não apareceu no extrato também. Dá pra desfazer a última importação, e o arquivo é reconhecido pelo número da conta.
- **Cartão de crédito de verdade**: dia de fechamento e vencimento por cartão, compra cai na fatura certa, parcelas viram uma linha por fatura, pagamento de fatura é transferência (não gasto), e o painel mostra quanto já está comprometido nos meses seguintes.
- **Categorização que aprende**: ao categorizar uma linha do extrato, o sistema salva o padrão e categoriza sozinho da próxima vez.
- **Painel com gráficos e insights** calculados em código: projeção do mês, categoria que mais subiu, gastos recorrentes, orçamento estourado, fatura vencendo, taxa de poupança.
- **Orçamento por percentual da renda**: grupos como Necessidades 40%, Lazer 15%, Educação 15%, Investimentos 30% (você define), cada categoria ligada a um grupo. Alerta dentro do app quando um grupo chega perto do limite e quando passa. Investimentos funciona como meta de aporte.
- **Viagens**: um período com teto próprio. O que você gasta nas datas da viagem entra no teto sozinho (fora as categorias fixas, como aluguel e faculdade) e sai dos grupos do orçamento mensal; passagem e o que foi pago antes entram como pré-pago, fora do teto. Mostra quanto dá pra gastar por dia até a volta.
- **Fixos previstos**: aluguel, financiamento, faculdade, assinaturas cadastrados uma vez. Viram lançamento no dia certo (pendente até o extrato confirmar), são descontados do "livre pra gastar" antes de cair e aparecem na seção "próximos 30 dias" do painel, junto com faturas, viagem e meta de aporte.
- **Investimentos**: posição do mês pré-preenchida com os ativos do mês anterior (um salvar só), evolução do patrimônio contra aportes acumulados, alocação por ativo e classe.
- **Chat que age**: além de responder, executa. "Vou viajar de 15/10 a 07/11 com limite de 1000" cria a viagem com teto e já puxa os gastos das datas; "minha renda mensal é 9500" e "lazer com 15%" ajustam o orçamento; "lança almoço 42 crédito rico" registra o gasto. Funciona em dois modos. Sem chave de IA, entende um conjunto de perguntas frequentes sobre os números e sobre o sistema ("quanto gastei com uber em agosto", "qual a fatura aberta", "como funciona a conciliação") e responde direto do banco, sem custo. Com `ANTHROPIC_API_KEY`, usa o Claude com ferramentas: responde qualquer pergunta consultando seus dados (nunca inventa número) e registra lançamentos por conversa. A API da Anthropic é paga por uso.
- **Categorias mês a mês**: mapa de calor dos últimos 6 meses com a variação contra a média.
- **Faturas**: pagamento registrado nas duas contas, fatura marcada como paga, limite disponível, gasto da fatura por categoria.
- **Exportar**: lançamentos em CSV e backup completo em JSON, direto de Configurações.
- **Tema claro, escuro ou automático**, salvo no navegador.

## Stack

Next.js 16 (App Router, Server Actions), TypeScript, Tailwind 4, Recharts, Postgres via `pg` (SQL direto, sem ORM), iron-session para login de usuário único, `@anthropic-ai/sdk` para o chat opcional.

## Rodando localmente

```bash
git clone <este repositório> bussola && cd bussola
npm install
cp .env.example .env.local   # edite: APP_PASSWORD, SESSION_SECRET (32+ chars)
```

**Sem instalar Postgres**: o projeto traz um Postgres em WASM (PGlite) que roda dentro do Node e grava em `./dados/pglite` (ignorado pelo git).

```bash
npm run db:local     # deixa rodando num terminal
npm run migrate      # cria as tabelas e as categorias padrão
npm run seed:demo    # opcional: dados fictícios para explorar as telas
npm run dev
```

Abra http://localhost:3000 e entre com a senha de `APP_PASSWORD`.

**Com Postgres de verdade** (Neon, Supabase, local): aponte `DATABASE_URL` e rode `npm run migrate`.

## Colocando em produção (Vercel + Neon)

1. Crie um banco no [Neon](https://neon.tech) (plano gratuito basta) e copie a connection string.
2. Importe o repositório na Vercel e defina as variáveis: `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET` (e `ANTHROPIC_API_KEY` só se quiser o chat).
3. Rode a migração uma vez, do seu computador, apontando para o banco de produção: `DATABASE_URL=... npm run migrate`.
4. No celular, abra a URL e use "Adicionar à tela de início": vira um app.

## Como usar no dia a dia

1. **Configurações**: cadastre sua conta corrente, seus cartões (com dia de fechamento e vencimento) e suas corretoras.
2. **Lançar**: durante o mês, registre o que gastou pela barra rápida. Leva 5 segundos.
3. **Importar extrato**: na virada do mês, exporte o OFX de cada conta e cartão e suba aqui. Veja a prévia (o que concilia, o que é novo, o que já existia) e confirme.
4. **Revisar**: categorize o que faltou. Marque "aprender esse padrão" para não precisar repetir.
5. **Investimentos**: uma vez por mês, registre o saldo de cada ativo.

### Sobre sinais e tipos

- Valor negativo é saída, positivo é entrada, em qualquer conta.
- `expense` e `income` entram nos gráficos. `transfer` (pagamento de fatura, aporte, resgate, Pix para você mesmo) nunca conta como gasto nem receita.
- No cartão, o gasto conta na **data da compra**. A fatura é só a visão de caixa: quando aquele dinheiro sai da conta.
- CSV de cartão costuma trazer compra como valor positivo. Marque "inverter sinais" na importação.

## Estrutura

```
app/(app)/        páginas autenticadas (painel, lançar, extrato, faturas, revisar, viagens, importar, investimentos, config, chat)
app/actions/      server actions (auth, transações, config, importação, investimentos)
app/api/chat/     rota de streaming do chat (só com ANTHROPIC_API_KEY)
lib/ofx.ts        parser de OFX 1.x e 2.x tolerante a banco brasileiro
lib/csv.ts        parser de CSV com detecção de colunas
lib/pdf.ts        leitura de extrato/fatura em PDF (heurística sobre o texto)
lib/reconcile.ts  prévia e gravação da importação, conciliação por valor + data
lib/quickparse.ts interpretador da barra rápida (sem IA)
lib/insights.ts   insights calculados
lib/budget.ts     orçamento por percentual e alertas
lib/trips.ts      viagens com teto próprio
lib/queries.ts    acesso a dados
lib/chat/local.ts chat sem IA (perguntas frequentes)
lib/chat/tools.ts ferramentas que o modelo usa no chat com IA
scripts/          migrate, seed:demo, db:local (PGlite), make-icons
```

## Privacidade

Este repositório contém só código. Seus dados ficam no seu banco. O `.gitignore` bloqueia `.env*`, `dados/`, `*.ofx`, `*.csv`, `*.pdf` e afins para você não commitar um extrato sem querer. Os prints e o seed usam dados fictícios.

## Licença

MIT.
