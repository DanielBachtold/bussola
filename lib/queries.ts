import { pool, type Queryable } from './db';
import { addMonths, addMonthsToDate, currentMonth, invoiceMonthFor, monthEnd, monthStart, todayISO } from './dates';
import { escapeRegex, normalizeText } from './rules';
import { round2 } from './money';
import type { Account, Category, Snapshot, Transaction, TxKind, TxSource } from './types';

// ---------- Contas ----------

export async function listAccounts(db: Queryable = pool, includeArchived = false): Promise<Account[]> {
  const { rows } = await db.query<Account>(
    `SELECT * FROM accounts ${includeArchived ? '' : 'WHERE archived = FALSE'} ORDER BY kind, name`,
  );
  return rows;
}

export async function getAccount(id: number, db: Queryable = pool): Promise<Account | null> {
  const { rows } = await db.query<Account>(`SELECT * FROM accounts WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findAccountByName(name: string, db: Queryable = pool): Promise<Account | null> {
  const { rows } = await db.query<Account>(
    `SELECT * FROM accounts WHERE archived = FALSE AND (lower(name) = lower($1) OR lower(name) LIKE lower($2) OR lower(institution) LIKE lower($2)) ORDER BY id LIMIT 1`,
    [name, `%${name}%`],
  );
  return rows[0] ?? null;
}

// ---------- Categorias ----------

export async function listCategories(db: Queryable = pool): Promise<Category[]> {
  const { rows } = await db.query<Category>(`SELECT * FROM categories ORDER BY kind, name`);
  return rows;
}

export async function findCategoryByName(name: string, db: Queryable = pool): Promise<Category | null> {
  const { rows } = await db.query<Category>(
    `SELECT * FROM categories WHERE lower(name) = lower($1) OR lower(name) LIKE lower($2) ORDER BY id LIMIT 1`,
    [name, `%${name}%`],
  );
  return rows[0] ?? null;
}

// ---------- Transações ----------

const TX_SELECT = `
  SELECT t.*, a.name AS account_name, a.kind AS account_kind, c.name AS category_name, c.icon AS category_icon, tr.name AS trip_name
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN trips tr ON tr.id = t.trip_id`;

export type TxFilter = {
  month?: string;
  start?: string;
  end?: string;
  accountId?: number;
  /** id, ou 'none' para "sem categoria" */
  categoryId?: number | 'none';
  kind?: TxKind;
  search?: string;
  /** valor exato (busca por "249,90") */
  amount?: number;
  status?: string;
  reviewed?: boolean;
  invoiceMonth?: string;
  tripId?: number;
  limit?: number;
  offset?: number;
};

export type TxPage = { items: Transaction[]; total: number; expense: number; income: number };

function txWhere(f: TxFilter) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };

  if (f.month) { add('t.date >= ?', monthStart(f.month)); add('t.date <= ?', monthEnd(f.month)); }
  if (f.start) add('t.date >= ?', f.start);
  if (f.end) add('t.date <= ?', f.end);
  if (f.accountId) add('t.account_id = ?', f.accountId);
  if (f.categoryId === 'none') where.push('t.category_id IS NULL');
  else if (f.categoryId) add('t.category_id = ?', f.categoryId);
  if (f.kind) add('t.kind = ?', f.kind);
  if (f.status) add('t.status = ?', f.status);
  if (typeof f.reviewed === 'boolean') add('t.reviewed = ?', f.reviewed);
  if (f.invoiceMonth) add('t.invoice_month = ?', monthStart(f.invoiceMonth));
  if (f.tripId) add('t.trip_id = ?', f.tripId);
  if (f.amount !== undefined) add('ABS(t.amount) = ?', round2(f.amount));
  else if (f.search) {
    // busca sem acento: "cafe" acha "Café" e vice-versa
    const re = accentInsensitiveRegex(f.search);
    add(`(t.description ~* ? OR t.statement_description ~* $${params.length + 1})`, re);
  }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

export async function listTransactions(f: TxFilter = {}, db: Queryable = pool): Promise<Transaction[]> {
  const { clause, params } = txWhere(f);
  const sql = `${TX_SELECT} ${clause}
    ORDER BY t.date DESC, t.id DESC LIMIT ${Math.min(f.limit ?? 500, 2000)} OFFSET ${f.offset ?? 0}`;
  const { rows } = await db.query<Transaction>(sql, params);
  return rows;
}

/** Página de lançamentos com o total e as somas do filtro inteiro (não só da página). */
export async function pageTransactions(f: TxFilter = {}, db: Queryable = pool): Promise<TxPage> {
  const { clause, params } = txWhere(f);
  const [items, agg] = await Promise.all([
    listTransactions(f, db),
    db.query<{ total: number; expense: number; income: number }>(
      `SELECT COUNT(*)::int AS total,
              COALESCE(ABS(SUM(t.amount) FILTER (WHERE t.kind = 'expense')), 0)::numeric AS expense,
              COALESCE(SUM(t.amount) FILTER (WHERE t.kind = 'income'), 0)::numeric AS income
       FROM transactions t ${clause}`, params,
    ),
  ]);
  return { items, total: agg.rows[0]?.total ?? 0, expense: agg.rows[0]?.expense ?? 0, income: agg.rows[0]?.income ?? 0 };
}

const ACCENT_CLASS: Record<string, string> = {
  a: '[aáàâãä]', e: '[eéèêë]', i: '[iíìîï]', o: '[oóòôõö]', u: '[uúùûü]', c: '[cç]', n: '[nñ]',
};

/** Regex POSIX (para ~*) que casa o termo ignorando acentos dos dois lados. */
export function accentInsensitiveRegex(term: string): string {
  return normalizeText(term)
    .split('')
    .map((ch) => ACCENT_CLASS[ch] ?? escapeRegex(ch))
    .join('');
}

export async function getTransaction(id: number, db: Queryable = pool): Promise<Transaction | null> {
  const { rows } = await db.query<Transaction>(`${TX_SELECT} WHERE t.id = $1`, [id]);
  return rows[0] ?? null;
}

export type NewTransaction = {
  accountId: number;
  date: string;
  amount: number; // sinal já resolvido: negativo = saída
  description: string;
  categoryId?: number | null;
  kind?: TxKind;
  source: TxSource;
  status?: 'pending' | 'reconciled' | 'imported';
  reviewed?: boolean;
  installments?: number;
  notes?: string | null;
  fitid?: string | null;
  statementDescription?: string | null;
  /** undefined = liga sozinho à viagem ativa na data (se a categoria não for fixa); null = não ligar */
  tripId?: number | null;
  tripExcluded?: boolean;
  recurringId?: number | null;
};

/**
 * Cria a transação. No cartão, calcula a fatura. Com parcelas, gera uma linha
 * por mês, cada uma na sua fatura, ligadas por installment_group.
 */
export async function createTransaction(input: NewTransaction, db: Queryable = pool): Promise<Transaction[]> {
  const account = await getAccount(input.accountId, db);
  if (!account) throw new Error('Conta não encontrada.');
  const kind: TxKind = input.kind ?? (input.amount < 0 ? 'expense' : 'income');
  const total = Math.max(1, Math.floor(input.installments ?? 1));
  const created: Transaction[] = [];

  // viagem: gasto dentro do período de uma viagem entra nela, a não ser que a categoria seja fixa
  let tripId = input.tripId ?? null;
  if (input.tripId === undefined && kind === 'expense') {
    const { rows: trips } = await db.query<{ id: number }>(`SELECT id FROM trips WHERE $1::date BETWEEN start_date AND end_date ORDER BY start_date DESC LIMIT 1`, [input.date]);
    if (trips[0]) {
      const fixed = input.categoryId ? (await db.query<{ fixed: boolean }>(`SELECT fixed FROM categories WHERE id = $1`, [input.categoryId])).rows[0]?.fixed : false;
      if (!fixed) tripId = trips[0].id;
    }
  }

  // a fatura é definida uma vez pela data da compra e avança um mês por parcela.
  // Recalcular a partir da data de cada parcela erra quando o dia é clampado
  // (compra dia 31, fechamento 30: a parcela de fevereiro cairia em fevereiro de novo).
  const firstInvoice = account.kind === 'credit_card' && account.closing_day ? invoiceMonthFor(input.date, account.closing_day) : null;

  const group = total > 1 ? crypto.randomUUID() : null;
  const cents = Math.round(Math.abs(input.amount) * 100);
  const base = Math.floor(cents / total);
  const remainder = cents - base * total;
  const sign = input.amount < 0 ? -1 : 1;

  for (let i = 0; i < total; i++) {
    const date = addMonthsToDate(input.date, i);
    const partCents = base + (i === total - 1 ? remainder : 0);
    const amount = round2((sign * partCents) / 100);
    const invoiceMonth = firstInvoice ? monthStart(addMonths(firstInvoice, i)) : null;
    const description = total > 1 ? `${input.description} (${i + 1}/${total})` : input.description;
    const { rows } = await db.query(
      `INSERT INTO transactions
        (account_id, date, amount, description, category_id, kind, source, status, reviewed, fitid, statement_description,
         invoice_month, installment_group, installment_n, installment_total, notes, trip_id, trip_excluded, recurring_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [
        input.accountId, date, amount, description, input.categoryId ?? null, kind, input.source,
        input.status ?? (input.source === 'import' ? 'imported' : 'pending'),
        input.reviewed ?? input.source !== 'import',
        i === 0 ? input.fitid ?? null : null,
        input.statementDescription ?? null,
        invoiceMonth, group, total > 1 ? i + 1 : null, total > 1 ? total : null, input.notes ?? null,
        // parcelas seguintes de uma compra na viagem continuam da viagem (o gasto foi lá)
        tripId, input.tripExcluded ?? false, input.recurringId ?? null,
      ],
    );
    const tx = await getTransaction(rows[0].id, db);
    if (tx) created.push(tx);
  }
  return created;
}

export type TxPatch = Partial<{
  date: string;
  amount: number;
  description: string;
  categoryId: number | null;
  kind: TxKind;
  reviewed: boolean;
  notes: string | null;
  accountId: number;
  tripId: number | null;
  tripExcluded: boolean;
}>;

export async function updateTransaction(id: number, patch: TxPatch, db: Queryable = pool): Promise<Transaction | null> {
  const current = await getTransaction(id, db);
  if (!current) return null;
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown) => { params.push(v); sets.push(`${col} = $${params.length}`); };

  if (patch.date !== undefined) set('date', patch.date);
  if (patch.amount !== undefined) set('amount', patch.amount);
  if (patch.description !== undefined) set('description', patch.description);
  if (patch.categoryId !== undefined) set('category_id', patch.categoryId);
  if (patch.kind !== undefined) set('kind', patch.kind);
  if (patch.reviewed !== undefined) set('reviewed', patch.reviewed);
  if (patch.notes !== undefined) set('notes', patch.notes);
  if (patch.accountId !== undefined) set('account_id', patch.accountId);
  if (patch.tripId !== undefined) set('trip_id', patch.tripId);
  if (patch.tripExcluded !== undefined) set('trip_excluded', patch.tripExcluded);

  const accountId = patch.accountId ?? current.account_id;
  const date = patch.date ?? current.date;
  if (patch.date !== undefined || patch.accountId !== undefined) {
    const account = await getAccount(accountId, db);
    const invoice = account?.kind === 'credit_card' && account.closing_day ? monthStart(invoiceMonthFor(date, account.closing_day)) : null;
    set('invoice_month', invoice);
  }
  if (!sets.length) return current;
  set('updated_at', new Date());
  params.push(id);
  await db.query(`UPDATE transactions SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  return getTransaction(id, db);
}

/** Linha crua da tabela (sem os joins), do jeito que volta de RETURNING *: serve pra desfazer uma exclusão. */
export type TransactionRow = Record<string, unknown> & { id: number };

export async function deleteTransaction(id: number, db: Queryable = pool): Promise<TransactionRow[]> {
  const { rows } = await db.query<TransactionRow>(`DELETE FROM transactions WHERE id = $1 RETURNING *`, [id]);
  return rows;
}

export async function deleteInstallmentGroup(group: string, fromN: number, db: Queryable = pool): Promise<TransactionRow[]> {
  const { rows } = await db.query<TransactionRow>(`DELETE FROM transactions WHERE installment_group = $1 AND installment_n >= $2 RETURNING *`, [group, fromN]);
  return rows;
}

const TX_COLUMNS = [
  'id', 'account_id', 'date', 'amount', 'description', 'category_id', 'kind', 'source', 'status', 'reviewed', 'fitid', 'statement_description',
  'invoice_month', 'installment_group', 'installment_n', 'installment_total', 'notes', 'trip_id', 'trip_excluded', 'recurring_id', 'created_at',
];

/** Reinsere linhas apagadas com os mesmos ids (o "desfazer" da exclusão). */
export async function restoreTransactions(rows: TransactionRow[], db: Queryable = pool): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const cols = TX_COLUMNS.filter((c) => c in r);
    const values = cols.map((c) => r[c] ?? null);
    const { rowCount } = await db.query(
      `INSERT INTO transactions (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT (id) DO NOTHING`,
      values,
    );
    n += rowCount ?? 0;
  }
  return n;
}

export type FrequentDescription = { key: string; description: string; n: number; category_id: number | null; account_id: number | null; amount: number };

/** O que o usuário mais lança na mão (90 dias): vira chip na barra rápida e memória de categoria/conta. */
export async function frequentDescriptions(db: Queryable = pool): Promise<FrequentDescription[]> {
  const { rows } = await db.query<FrequentDescription>(
    `SELECT lower(regexp_replace(description, '\\s*\\(\\d+/\\d+\\)$', '')) AS key,
            MAX(regexp_replace(description, '\\s*\\(\\d+/\\d+\\)$', '')) AS description,
            COUNT(*)::int AS n,
            (array_agg(category_id ORDER BY date DESC))[1] AS category_id,
            (array_agg(account_id ORDER BY date DESC))[1] AS account_id,
            ABS((array_agg(amount ORDER BY date DESC))[1])::numeric AS amount
     FROM transactions
     WHERE source IN ('manual','chat') AND kind = 'expense' AND date >= CURRENT_DATE - 90
     GROUP BY 1 HAVING COUNT(*) >= 2 ORDER BY n DESC LIMIT 30`,
  );
  return rows;
}

// ---------- Resumos ----------

export type CategoryTotal = { category_id: number | null; name: string; icon: string | null; total: number; count: number; budget: number | null };

export async function monthTotals(month: string, db: Queryable = pool) {
  const { rows } = await db.query<{ kind: TxKind; total: number; count: number }>(
    `SELECT kind, COALESCE(SUM(amount),0)::numeric AS total, COUNT(*)::int AS count
     FROM transactions WHERE date >= $1 AND date <= $2 GROUP BY kind`,
    [monthStart(month), monthEnd(month)],
  );
  const get = (k: TxKind) => rows.find((r) => r.kind === k);
  return {
    expense: Math.abs(get('expense')?.total ?? 0),
    income: get('income')?.total ?? 0,
    expenseCount: get('expense')?.count ?? 0,
    incomeCount: get('income')?.count ?? 0,
  };
}

export async function expensesByCategory(start: string, end: string, db: Queryable = pool): Promise<CategoryTotal[]> {
  const { rows } = await db.query<CategoryTotal>(
    `SELECT t.category_id, COALESCE(c.name, 'Sem categoria') AS name, c.icon,
            ABS(SUM(t.amount))::numeric AS total, COUNT(*)::int AS count, c.budget
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.kind = 'expense' AND t.date >= $1 AND t.date <= $2
     GROUP BY t.category_id, c.name, c.icon, c.budget ORDER BY total DESC`,
    [start, end],
  );
  return rows;
}

/** Média mensal de gasto por categoria nos N meses anteriores ao mês dado. */
export async function categoryAverages(month: string, months = 3, db: Queryable = pool): Promise<Map<number | null, number>> {
  const start = monthStart(addMonths(month, -months));
  const end = monthEnd(addMonths(month, -1));
  const { rows } = await db.query<{ category_id: number | null; total: number }>(
    `SELECT category_id, ABS(SUM(amount))::numeric / $3 AS total
     FROM transactions WHERE kind = 'expense' AND date >= $1 AND date <= $2 GROUP BY category_id`,
    [start, end, months],
  );
  return new Map(rows.map((r) => [r.category_id, r.total]));
}

export type MonthPoint = { month: string; expense: number; income: number };

export async function monthlySeries(months = 12, db: Queryable = pool): Promise<MonthPoint[]> {
  const first = monthStart(addMonths(currentMonth(), -(months - 1)));
  const { rows } = await db.query<{ month: string; kind: TxKind; total: number }>(
    `SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month, kind, SUM(amount)::numeric AS total
     FROM transactions WHERE date >= $1 AND kind IN ('expense','income') GROUP BY 1, 2 ORDER BY 1`,
    [first],
  );
  const out: MonthPoint[] = [];
  for (let i = 0; i < months; i++) {
    const m = addMonths(first, i);
    const exp = rows.find((r) => r.month === m && r.kind === 'expense')?.total ?? 0;
    const inc = rows.find((r) => r.month === m && r.kind === 'income')?.total ?? 0;
    out.push({ month: m, expense: Math.abs(exp), income: inc });
  }
  return out;
}

export type DailyPoint = { day: number; current: number | null; previous: number };

/** Gasto acumulado dia a dia do mês, contra o mês anterior. */
export async function dailyCumulative(month: string, db: Queryable = pool): Promise<DailyPoint[]> {
  const prev = addMonths(month, -1);
  const { rows } = await db.query<{ month: string; day: number; total: number }>(
    `SELECT to_char(date, 'YYYY-MM') AS month, EXTRACT(DAY FROM date)::int AS day, ABS(SUM(amount))::numeric AS total
     FROM transactions WHERE kind = 'expense' AND date >= $1 AND date <= $2 GROUP BY 1, 2`,
    [monthStart(prev), monthEnd(month)],
  );
  const daysInMonth = Number(monthEnd(month).slice(8, 10));
  const today = todayISO();
  const lastDayCurrent = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : daysInMonth;
  let cur = 0, pre = 0;
  const out: DailyPoint[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    cur += rows.find((r) => r.month === month && r.day === d)?.total ?? 0;
    pre += rows.find((r) => r.month === prev && r.day === d)?.total ?? 0;
    out.push({ day: d, current: d <= lastDayCurrent ? round2(cur) : null, previous: round2(pre) });
  }
  return out;
}

// ---------- Faturas e cartão ----------

export type InvoiceSummary = { account_id: number; account_name: string; invoice_month: string; total: number; count: number; installments: number };

export async function invoiceSummaries(accountId?: number, db: Queryable = pool): Promise<InvoiceSummary[]> {
  const { rows } = await db.query<InvoiceSummary>(
    `SELECT t.account_id, a.name AS account_name, to_char(t.invoice_month, 'YYYY-MM') AS invoice_month,
            ABS(SUM(CASE WHEN t.kind = 'expense' THEN t.amount ELSE 0 END))::numeric AS total,
            COUNT(*) FILTER (WHERE t.kind = 'expense')::int AS count,
            COUNT(*) FILTER (WHERE t.installment_group IS NOT NULL)::int AS installments
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.invoice_month IS NOT NULL ${accountId ? 'AND t.account_id = $1' : ''}
     GROUP BY 1, 2, 3 ORDER BY 3 DESC, 2`,
    accountId ? [accountId] : [],
  );
  return rows;
}

/** Quanto já foi pago (transferências que entraram no cartão) entre o fechamento e 15 dias depois do vencimento. */
export async function invoicePayments(accountId: number, closes: string, due: string, db: Queryable = pool): Promise<{ paid: number; paidAt: string | null }> {
  const { rows } = await db.query<{ paid: number; paid_at: string | null }>(
    `SELECT COALESCE(SUM(amount),0)::numeric AS paid, MAX(date) AS paid_at FROM transactions
     WHERE account_id = $1 AND kind = 'transfer' AND amount > 0 AND date >= $2::date - INTERVAL '3 days' AND date <= $3::date + INTERVAL '15 days'`,
    [accountId, closes, due],
  );
  return { paid: rows[0]?.paid ?? 0, paidAt: rows[0]?.paid_at ?? null };
}

/** Gasto por categoria dentro de uma fatura. */
export async function invoiceByCategory(accountId: number, invoiceMonth: string, db: Queryable = pool): Promise<CategoryTotal[]> {
  const { rows } = await db.query<CategoryTotal>(
    `SELECT t.category_id, COALESCE(c.name, 'Sem categoria') AS name, c.icon, ABS(SUM(t.amount))::numeric AS total, COUNT(*)::int AS count, c.budget
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.account_id = $1 AND t.invoice_month = $2 AND t.kind = 'expense'
     GROUP BY t.category_id, c.name, c.icon, c.budget ORDER BY total DESC`,
    [accountId, monthStart(invoiceMonth)],
  );
  return rows;
}

export type Commitment = { month: string; total: number; count: number };

/** Parcelas já assumidas que ainda vão cair nas próximas faturas. */
export async function futureCommitments(accountId?: number, db: Queryable = pool): Promise<Commitment[]> {
  const { rows } = await db.query<Commitment>(
    `SELECT to_char(invoice_month, 'YYYY-MM') AS month, ABS(SUM(amount))::numeric AS total, COUNT(*)::int AS count
     FROM transactions
     WHERE installment_group IS NOT NULL AND kind = 'expense' AND invoice_month > $1 ${accountId ? 'AND account_id = $2' : ''}
     GROUP BY 1 ORDER BY 1`,
    accountId ? [monthStart(currentMonth()), accountId] : [monthStart(currentMonth())],
  );
  return rows;
}

// ---------- Revisão / pendências ----------

export async function pendingReview(db: Queryable = pool) {
  const unreviewed = await listTransactions({ reviewed: false, limit: 300 }, db);
  const { rows: totalRows } = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM transactions WHERE reviewed = FALSE`);
  const total = totalRows[0]?.n ?? 0;
  // lançamentos manuais que já deveriam ter aparecido em algum extrato importado
  const { rows: unmatched } = await db.query<Transaction>(
    `${TX_SELECT}
     WHERE t.status = 'pending' AND t.source IN ('manual','chat')
       AND EXISTS (
         SELECT 1 FROM imports i WHERE i.account_id = t.account_id AND i.period_end >= t.date + INTERVAL '4 days'
       )
     ORDER BY t.date DESC LIMIT 300`,
  );
  return { unreviewed, unmatched, total };
}

/** As categorias mais usadas em cada conta nos últimos 90 dias: viram chips na revisão. */
export async function topCategoriesByAccount(limit = 3, db: Queryable = pool): Promise<Record<number, number[]>> {
  const { rows } = await db.query<{ account_id: number; category_id: number; n: number }>(
    `SELECT account_id, category_id, COUNT(*)::int AS n FROM transactions
     WHERE kind = 'expense' AND category_id IS NOT NULL AND date >= CURRENT_DATE - 90
     GROUP BY 1, 2 ORDER BY 1, 3 DESC`,
  );
  const out: Record<number, number[]> = {};
  for (const r of rows) {
    out[r.account_id] ??= [];
    if (out[r.account_id].length < limit) out[r.account_id].push(r.category_id);
  }
  return out;
}

// ---------- Investimentos ----------

export async function listSnapshots(db: Queryable = pool): Promise<Snapshot[]> {
  const { rows } = await db.query<Snapshot>(
    `SELECT s.*, a.name AS account_name FROM investment_snapshots s JOIN accounts a ON a.id = s.account_id
     ORDER BY s.month DESC, a.name, s.asset`,
  );
  return rows;
}

export async function upsertSnapshot(input: { accountId: number; asset: string; assetClass?: string | null; month: string; balance: number }, db: Queryable = pool) {
  await db.query(
    `INSERT INTO investment_snapshots (account_id, asset, asset_class, month, balance)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (account_id, asset, month) DO UPDATE SET balance = EXCLUDED.balance, asset_class = COALESCE(EXCLUDED.asset_class, investment_snapshots.asset_class)`,
    [input.accountId, input.asset.trim(), input.assetClass ?? null, monthStart(input.month), input.balance],
  );
}

export async function deleteSnapshot(id: number, db: Queryable = pool): Promise<Snapshot | null> {
  const { rows } = await db.query<Snapshot>(`DELETE FROM investment_snapshots WHERE id = $1 RETURNING *`, [id]);
  return rows[0] ?? null;
}

export type NetWorthPoint = { month: string; total: number; contributions: number };

/** Patrimônio investido por mês (soma dos snapshots) e aportes do mês (transferências pra contas de investimento). */
export async function netWorthSeries(db: Queryable = pool): Promise<NetWorthPoint[]> {
  const { rows } = await db.query<{ month: string; total: number }>(
    `SELECT to_char(month, 'YYYY-MM') AS month, SUM(balance)::numeric AS total FROM investment_snapshots GROUP BY 1 ORDER BY 1`,
  );
  const { rows: contrib } = await db.query<{ month: string; total: number }>(
    `SELECT to_char(date_trunc('month', t.date), 'YYYY-MM') AS month, SUM(t.amount)::numeric AS total
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.kind = 'transfer' AND a.kind = 'investment' GROUP BY 1`,
  );
  return rows.map((r) => ({ month: r.month, total: r.total, contributions: contrib.find((c) => c.month === r.month)?.total ?? 0 }));
}

/** Posição mais recente de cada ativo (cada um no seu último mês registrado). */
/** Aportes (transferências que entraram) por conta de investimento num mês. */
export async function contributionsByAccount(month: string, db: Queryable = pool): Promise<Record<number, number>> {
  const { rows } = await db.query<{ account_id: number; total: number }>(
    `SELECT t.account_id, SUM(t.amount)::numeric AS total FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.kind = 'transfer' AND a.kind = 'investment' AND t.date >= $1 AND t.date <= $2 GROUP BY 1`,
    [monthStart(month), monthEnd(month)],
  );
  return Object.fromEntries(rows.map((r) => [r.account_id, r.total]));
}

export async function latestAllocation(db: Queryable = pool): Promise<Snapshot[]> {
  const { rows } = await db.query<Snapshot>(
    `SELECT * FROM (
       SELECT DISTINCT ON (s.account_id, s.asset) s.*, a.name AS account_name
       FROM investment_snapshots s JOIN accounts a ON a.id = s.account_id
       WHERE a.archived = FALSE
       ORDER BY s.account_id, s.asset, s.month DESC
     ) latest ORDER BY balance DESC`,
  );
  return rows;
}

// ---------- Chats ----------

export type ChatRow = { id: number; title: string | null; created_at: string; updated_at: string };
export type ChatMessageRow = { id: number; chat_id: number; role: 'user' | 'assistant'; content: unknown; display: string | null; created_at: string };

export async function listChats(db: Queryable = pool): Promise<ChatRow[]> {
  const { rows } = await db.query<ChatRow>(`SELECT * FROM chats ORDER BY updated_at DESC LIMIT 50`);
  return rows;
}

export async function createChat(title: string | null, db: Queryable = pool): Promise<number> {
  const { rows } = await db.query<{ id: number }>(`INSERT INTO chats (title) VALUES ($1) RETURNING id`, [title]);
  return rows[0].id;
}

export async function getChatMessages(chatId: number, db: Queryable = pool): Promise<ChatMessageRow[]> {
  const { rows } = await db.query<ChatMessageRow>(`SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY id`, [chatId]);
  return rows;
}

export async function addChatMessage(chatId: number, role: 'user' | 'assistant', content: unknown, display: string | null, db: Queryable = pool) {
  await db.query(`INSERT INTO chat_messages (chat_id, role, content, display) VALUES ($1,$2,$3,$4)`, [chatId, role, JSON.stringify(content), display]);
  await db.query(`UPDATE chats SET updated_at = NOW(), title = COALESCE(title, $2) WHERE id = $1`, [chatId, role === 'user' && display ? display.slice(0, 60) : null]);
}

export async function deleteChat(chatId: number, db: Queryable = pool) {
  await db.query(`DELETE FROM chats WHERE id = $1`, [chatId]);
}
