import { pool, type Queryable } from './db';
import { addMonths, currentMonth, monthEnd, monthStart } from './dates';
import { formatBRL } from './money';
import type { BudgetGroup, Category } from './types';

/**
 * Orçamento por percentual da renda: cada grupo (necessidades, lazer,
 * educação, investimentos...) tem um % e um conjunto de categorias.
 * A base é a renda mensal configurada; sem ela, a receita real do mês;
 * sem receita ainda, a média dos 3 meses anteriores.
 */

export type GroupStatus = {
  group: BudgetGroup;
  categories: Category[];
  limit: number;
  spent: number;
  pct: number; // 0..∞, fração do limite já usada
  status: 'ok' | 'warn' | 'over' | 'none' | 'pending'; // pending: meta de aporte ainda em andamento no mês
};

export type BudgetStatus = {
  month: string;
  base: number;
  baseSource: 'configurada' | 'receita do mês' | 'média de 3 meses' | 'nenhuma';
  threshold: number; // fração (0.8 = avisa aos 80%)
  totalPercent: number;
  groups: GroupStatus[];
  unassigned: { spent: number; categories: Category[] };
  alerts: Array<{ tone: 'warning' | 'bad'; title: string; detail: string; groupId: number }>;
};

export async function getSetting(key: string, db: Queryable = pool): Promise<string | null> {
  const { rows } = await db.query<{ value: string }>(`SELECT value FROM settings WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string | null, db: Queryable = pool) {
  if (value === null || value === '') await db.query(`DELETE FROM settings WHERE key = $1`, [key]);
  else await db.query(`INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, value]);
}

export async function listGroups(db: Queryable = pool): Promise<BudgetGroup[]> {
  const { rows } = await db.query<BudgetGroup>(`SELECT * FROM budget_groups ORDER BY sort, id`);
  return rows;
}

export async function getBudgetStatus(month: string = currentMonth(), db: Queryable = pool): Promise<BudgetStatus> {
  const [groups, cats, incomeCfg, thresholdCfg] = await Promise.all([
    listGroups(db),
    db.query<Category>(`SELECT * FROM categories ORDER BY name`).then((r) => r.rows),
    getSetting('monthly_income', db),
    getSetting('alert_threshold', db),
  ]);
  const threshold = Math.min(Math.max(Number(thresholdCfg ?? 80) / 100, 0.1), 1);
  const start = monthStart(month), end = monthEnd(month);

  const { rows: incomeRows } = await db.query<{ total: number }>(
    `SELECT COALESCE(SUM(amount),0)::numeric AS total FROM transactions WHERE kind = 'income' AND date >= $1 AND date <= $2`, [start, end],
  );
  let base = Number(incomeCfg ?? 0);
  let baseSource: BudgetStatus['baseSource'] = 'configurada';
  if (!base) {
    base = incomeRows[0]?.total ?? 0;
    baseSource = 'receita do mês';
  }
  if (!base) {
    const { rows } = await db.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount),0)::numeric / 3 AS total FROM transactions WHERE kind = 'income' AND date >= $1 AND date <= $2`,
      [monthStart(addMonths(month, -3)), monthEnd(addMonths(month, -1))],
    );
    base = rows[0]?.total ?? 0;
    baseSource = base ? 'média de 3 meses' : 'nenhuma';
  }

  const { rows: spentRows } = await db.query<{ category_id: number | null; total: number }>(
    `SELECT category_id, ABS(SUM(amount))::numeric AS total FROM transactions
     WHERE kind = 'expense' AND date >= $1 AND date <= $2
       AND (trip_id IS NULL OR trip_excluded) -- gasto de viagem tem o próprio teto, não entra nos grupos
     GROUP BY category_id`, [start, end],
  );
  const spentByCat = new Map(spentRows.map((r) => [r.category_id, r.total]));
  const { rows: investRows } = await db.query<{ total: number }>(
    `SELECT COALESCE(SUM(t.amount),0)::numeric AS total FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.kind = 'transfer' AND a.kind = 'investment' AND t.amount > 0 AND t.date >= $1 AND t.date <= $2`, [start, end],
  );

  // investimento só cobra no fim do mês (a partir do dia 25) ou em mês já fechado:
  // no começo do mês é normal ainda não ter aportado
  const today = new Date();
  const investmentDue = month < currentMonth() || (month === currentMonth() && today.getDate() >= 25);

  const statuses: GroupStatus[] = groups.map((g) => {
    const categories = cats.filter((c) => c.group_id === g.id);
    const spent = g.basis === 'investment'
      ? investRows[0]?.total ?? 0
      : categories.reduce((a, c) => a + (spentByCat.get(c.id) ?? 0), 0);
    const limit = (base * g.percent) / 100;
    const pct = limit > 0 ? spent / limit : 0;
    let status: GroupStatus['status'] = 'none';
    if (limit > 0) {
      if (g.basis === 'investment') status = pct >= 1 ? 'ok' : !investmentDue ? 'pending' : pct >= threshold ? 'warn' : 'over';
      else status = pct > 1 ? 'over' : pct >= threshold ? 'warn' : 'ok';
    }
    return { group: g, categories, limit, spent, pct, status };
  });

  const assigned = new Set(cats.filter((c) => c.group_id).map((c) => c.id));
  const unassignedCats = cats.filter((c) => c.kind === 'expense' && !assigned.has(c.id));
  const unassignedSpent = [...spentByCat.entries()].filter(([id]) => id === null || !assigned.has(id)).reduce((a, [, v]) => a + v, 0);

  const alerts: BudgetStatus['alerts'] = [];
  for (const s of statuses) {
    if (s.status === 'none' || s.status === 'pending') continue;
    if (s.group.basis === 'investment') {
      if (s.status !== 'ok') alerts.push({ tone: 'warning', groupId: s.group.id, title: `Investimentos abaixo da meta`, detail: `${formatBRL(s.spent)} aportados de ${formatBRL(s.limit)} previstos (${Math.round(s.pct * 100)}%).` });
      continue;
    }
    if (s.status === 'over') alerts.push({ tone: 'bad', groupId: s.group.id, title: `${s.group.name} passou do limite`, detail: `${formatBRL(s.spent)} de ${formatBRL(s.limit)} (${Math.round(s.pct * 100)}%), ${formatBRL(s.spent - s.limit)} acima.` });
    else if (s.status === 'warn') alerts.push({ tone: 'warning', groupId: s.group.id, title: `${s.group.name} chegando no limite`, detail: `${formatBRL(s.spent)} de ${formatBRL(s.limit)} (${Math.round(s.pct * 100)}%), sobram ${formatBRL(s.limit - s.spent)}.` });
  }

  return {
    month, base, baseSource, threshold,
    totalPercent: groups.reduce((a, g) => a + Number(g.percent), 0),
    groups: statuses,
    unassigned: { spent: unassignedSpent, categories: unassignedCats },
    alerts,
  };
}
