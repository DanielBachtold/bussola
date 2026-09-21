import { pool, type Queryable } from './db';
import { addMonths, currentMonth, daysBetween, formatMonth, invoiceDates, monthStart, todayDay, todayISO, toISO, fromISO } from './dates';
import { createTransaction, invoiceSummaries, listAccounts } from './queries';
import { getBudgetStatus } from './budget';
import { tripsAround } from './trips';
import type { RecurringRule } from './types';

/**
 * Fixos previstos: aluguel, financiamento, faculdade, assinaturas. Cadastrados
 * uma vez, viram lançamento no dia certo (pendente, pra conciliar com o extrato)
 * e, antes do dia, entram como previsão no "livre pra gastar" e nos próximos 30 dias.
 */

export async function listRecurring(db: Queryable = pool): Promise<RecurringRule[]> {
  const { rows } = await db.query<RecurringRule>(
    `SELECT r.*, a.name AS account_name, c.name AS category_name, c.icon AS category_icon
     FROM recurring_rules r JOIN accounts a ON a.id = r.account_id LEFT JOIN categories c ON c.id = r.category_id
     ORDER BY r.day_of_month, r.description`,
  );
  return rows;
}

function dueDate(month: string, day: number): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return toISO(new Date(y, m - 1, Math.min(day, last)));
}

/**
 * Lança os fixos cujo dia já chegou neste mês e ainda não foram lançados.
 * Idempotente: roda a cada abertura do app sem duplicar.
 */
export async function postRecurring(db: Queryable = pool): Promise<number> {
  const month = currentMonth();
  const { rows } = await db.query<RecurringRule>(
    `SELECT * FROM recurring_rules WHERE active = TRUE AND (last_posted_month IS NULL OR last_posted_month < $1) AND day_of_month <= $2`,
    [monthStart(month), todayDay()],
  );
  let n = 0;
  for (const r of rows) {
    // trava a regra primeiro: duas abas abertas ao mesmo tempo não lançam duas vezes
    const { rowCount } = await db.query(
      `UPDATE recurring_rules SET last_posted_month = $2 WHERE id = $1 AND (last_posted_month IS NULL OR last_posted_month < $2)`,
      [r.id, monthStart(month)],
    );
    if (!rowCount) continue;
    const amount = r.kind === 'expense' ? -Math.abs(r.amount) : r.kind === 'income' ? Math.abs(r.amount) : r.amount;
    await createTransaction({
      accountId: r.account_id, date: dueDate(month, r.day_of_month), amount, description: r.description,
      categoryId: r.category_id, kind: r.kind, source: 'manual', status: 'pending', notes: 'fixo', recurringId: r.id,
      // conta fixa não entra em viagem
      tripId: null,
    }, db);
    n++;
  }
  return n;
}

/** Fixos de gasto deste mês que ainda não caíram (dia > hoje): abatem do "livre pra gastar". */
export async function pendingFixedThisMonth(db: Queryable = pool): Promise<{ total: number; items: RecurringRule[] }> {
  const { rows } = await db.query<RecurringRule>(
    `SELECT r.*, a.name AS account_name FROM recurring_rules r JOIN accounts a ON a.id = r.account_id
     WHERE r.active = TRUE AND r.kind = 'expense' AND r.day_of_month > $1 AND (r.last_posted_month IS NULL OR r.last_posted_month < $2)`,
    [todayDay(), monthStart(currentMonth())],
  );
  return { total: rows.reduce((a, r) => a + Math.abs(r.amount), 0), items: rows };
}

export type Upcoming = { date: string; label: string; amount: number; kind: 'invoice' | 'fixed' | 'trip' | 'goal'; href: string };

/** O que ainda vai sair nos próximos N dias: faturas, fixos, início de viagem e a meta de aporte. */
export async function upcoming(days = 30, db: Queryable = pool): Promise<Upcoming[]> {
  const today = todayISO();
  const limit = toISO(new Date(fromISO(today).getTime() + days * 86_400_000));
  const out: Upcoming[] = [];

  const accounts = await listAccounts(db);
  const summaries = await invoiceSummaries(undefined, db);
  for (const c of accounts.filter((a) => a.kind === 'credit_card' && a.closing_day && a.due_day)) {
    for (const m of [addMonths(currentMonth(), -1), currentMonth(), addMonths(currentMonth(), 1)]) {
      const { due } = invoiceDates(m, c.closing_day!, c.due_day!);
      if (due < today || due > limit) continue;
      const total = summaries.find((s) => s.account_id === c.id && s.invoice_month === m)?.total ?? 0;
      if (total > 0) out.push({ date: due, label: `Fatura ${c.name} (${formatMonth(m)})`, amount: total, kind: 'invoice', href: `/faturas?cartao=${c.id}&m=${m}` });
    }
  }

  const { rows: fixed } = await db.query<RecurringRule>(`SELECT * FROM recurring_rules WHERE active = TRUE AND kind = 'expense'`);
  for (const r of fixed) {
    for (const m of [currentMonth(), addMonths(currentMonth(), 1)]) {
      const d = dueDate(m, r.day_of_month);
      const posted = r.last_posted_month && r.last_posted_month.slice(0, 7) >= m;
      if (d < today || d > limit || posted) continue;
      out.push({ date: d, label: r.description, amount: Math.abs(r.amount), kind: 'fixed', href: '/config#fixos' });
    }
  }

  for (const t of await tripsAround(today, db)) {
    if (t.start_date >= today && t.start_date <= limit && t.budget > 0) out.push({ date: t.start_date, label: `Viagem ${t.name} (teto)`, amount: t.budget, kind: 'trip', href: `/viagens?v=${t.id}` });
  }

  const budget = await getBudgetStatus(currentMonth(), db);
  const goal = budget.groups.find((g) => g.group.basis === 'investment' && g.limit > 0 && g.spent < g.limit);
  if (goal) {
    const d = dueDate(currentMonth(), 25);
    if (d >= today && d <= limit) out.push({ date: d, label: 'Meta de aporte do mês', amount: goal.limit - goal.spent, kind: 'goal', href: '/investimentos' });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

export function daysUntil(date: string): number {
  return daysBetween(todayISO(), date);
}
