import { pool, type Queryable } from './db';
import { addMonths, currentMonth, formatMonth, invoiceDates, monthEnd, monthStart, todayISO, daysBetween } from './dates';
import { formatBRL } from './money';
import { categoryAverages, expensesByCategory, listAccounts, monthTotals } from './queries';

export type Insight = {
  tone: 'good' | 'warning' | 'neutral';
  title: string;
  detail: string;
};

/**
 * Insights calculados em código, sem IA: comparações com a média, projeção
 * de fim de mês, recorrências, faturas vencendo e orçamentos estourados.
 */
export async function computeInsights(month: string = currentMonth(), db: Queryable = pool): Promise<Insight[]> {
  const out: Insight[] = [];
  const isCurrent = month === currentMonth();
  const today = todayISO();
  const start = monthStart(month), end = monthEnd(month);

  const totals = await monthTotals(month, db);
  const byCat = await expensesByCategory(start, end, db);
  const avg = await categoryAverages(month, 3, db);
  const prevTotals = await monthTotals(addMonths(month, -1), db);

  // projeção do mês
  if (isCurrent && totals.expense > 0) {
    const day = Number(today.slice(8, 10));
    const days = Number(end.slice(8, 10));
    const projected = (totals.expense / day) * days;
    const avgTotal = [...avg.values()].reduce((a, b) => a + b, 0);
    if (avgTotal > 0) {
      const diff = (projected - avgTotal) / avgTotal;
      out.push({
        tone: diff > 0.1 ? 'warning' : diff < -0.1 ? 'good' : 'neutral',
        title: `Projeção de ${formatBRL(projected)} para o mês`,
        detail: diff > 0.1
          ? `No ritmo atual, ${Math.round(diff * 100)}% acima da média dos últimos 3 meses (${formatBRL(avgTotal)}).`
          : diff < -0.1
            ? `No ritmo atual, ${Math.round(-diff * 100)}% abaixo da média dos últimos 3 meses (${formatBRL(avgTotal)}).`
            : `Em linha com a média dos últimos 3 meses (${formatBRL(avgTotal)}).`,
      });
    }
  }

  // categoria que mais subiu / caiu contra a média
  const deltas = byCat
    .filter((c) => c.category_id !== null && (avg.get(c.category_id) ?? 0) > 50)
    .map((c) => ({ ...c, avg: avg.get(c.category_id) ?? 0, delta: c.total - (avg.get(c.category_id) ?? 0) }))
    .sort((a, b) => b.delta - a.delta);
  const up = deltas[0];
  if (up && up.delta > 0 && up.delta / up.avg > 0.25) {
    out.push({
      tone: 'warning',
      title: `${up.icon ?? ''} ${up.name} subiu ${Math.round((up.delta / up.avg) * 100)}%`,
      detail: `${formatBRL(up.total)} este mês contra média de ${formatBRL(up.avg)}. São ${up.count} lançamentos.`,
    });
  }
  const down = deltas[deltas.length - 1];
  if (down && down.delta < 0 && -down.delta / down.avg > 0.25 && down !== up) {
    out.push({
      tone: 'good',
      title: `${down.icon ?? ''} ${down.name} caiu ${Math.round((-down.delta / down.avg) * 100)}%`,
      detail: `${formatBRL(down.total)} este mês contra média de ${formatBRL(down.avg)}.`,
    });
  }

  // orçamento estourado
  for (const c of byCat) {
    if (c.budget && c.total > c.budget) {
      out.push({
        tone: 'warning',
        title: `${c.icon ?? ''} ${c.name} passou do orçamento`,
        detail: `${formatBRL(c.total)} de ${formatBRL(c.budget)} previstos (${Math.round((c.total / c.budget) * 100)}%).`,
      });
    }
  }

  // maior gasto único
  const { rows: biggest } = await db.query<{ description: string; amount: number; date: string; account_name: string }>(
    `SELECT t.description, t.amount, t.date, a.name AS account_name FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.kind = 'expense' AND t.date >= $1 AND t.date <= $2 AND t.installment_group IS NULL ORDER BY t.amount ASC LIMIT 1`,
    [start, end],
  );
  if (biggest[0] && totals.expense > 0 && Math.abs(biggest[0].amount) / totals.expense > 0.15) {
    out.push({
      tone: 'neutral',
      title: `Maior gasto: ${biggest[0].description}`,
      detail: `${formatBRL(Math.abs(biggest[0].amount))} no ${biggest[0].account_name}, ${Math.round((Math.abs(biggest[0].amount) / totals.expense) * 100)}% do mês.`,
    });
  }

  // recorrências: mesma descrição em 3 dos últimos 4 meses (assinaturas)
  const { rows: recurring } = await db.query<{ description: string; months: number; avg: number }>(
    `SELECT lower(description) AS description, COUNT(DISTINCT date_trunc('month', date))::int AS months, ABS(AVG(amount))::numeric AS avg
     FROM transactions WHERE kind = 'expense' AND date >= $1 AND installment_group IS NULL
     GROUP BY 1 HAVING COUNT(DISTINCT date_trunc('month', date)) >= 3 ORDER BY avg DESC`,
    [monthStart(addMonths(month, -3))],
  );
  if (recurring.length >= 2) {
    const total = recurring.reduce((a, r) => a + r.avg, 0);
    out.push({
      tone: 'neutral',
      title: `${recurring.length} gastos recorrentes somam ${formatBRL(total)}/mês`,
      detail: recurring.slice(0, 4).map((r) => `${cap(r.description)} (${formatBRL(r.avg)})`).join(', ') + (recurring.length > 4 ? '...' : ''),
    });
  }

  // fatura vencendo
  if (isCurrent) {
    const accounts = (await listAccounts(db)).filter((a) => a.kind === 'credit_card' && a.closing_day && a.due_day);
    for (const a of accounts) {
      for (const m of [addMonths(month, -1), month, addMonths(month, 1)]) {
        const { due } = invoiceDates(m, a.closing_day!, a.due_day!);
        const days = daysBetween(today, due);
        if (days >= 0 && days <= 7) {
          const { rows } = await db.query<{ total: number }>(
            `SELECT ABS(COALESCE(SUM(amount),0))::numeric AS total FROM transactions WHERE account_id = $1 AND invoice_month = $2 AND kind = 'expense'`,
            [a.id, monthStart(m)],
          );
          out.push({
            tone: 'warning',
            title: `Fatura ${a.name} de ${formatMonth(m)} vence em ${days === 0 ? 'hoje' : `${days} dia${days > 1 ? 's' : ''}`}`,
            detail: `${formatBRL(rows[0]?.total ?? 0)} em compras registradas.`,
          });
        }
      }
    }
  }

  // comparação com o mês anterior
  if (!isCurrent && prevTotals.expense > 0) {
    const diff = (totals.expense - prevTotals.expense) / prevTotals.expense;
    out.push({
      tone: diff > 0.1 ? 'warning' : diff < -0.1 ? 'good' : 'neutral',
      title: `${Math.abs(Math.round(diff * 100))}% ${diff >= 0 ? 'a mais' : 'a menos'} que ${formatMonth(addMonths(month, -1))}`,
      detail: `${formatBRL(totals.expense)} contra ${formatBRL(prevTotals.expense)}.`,
    });
  }

  // taxa de poupança
  if (totals.income > 0) {
    const rate = (totals.income - totals.expense) / totals.income;
    out.push({
      tone: rate >= 0.2 ? 'good' : rate < 0 ? 'warning' : 'neutral',
      title: rate >= 0 ? `Sobrou ${Math.round(rate * 100)}% da receita` : `Gastou ${Math.round(-rate * 100)}% além da receita`,
      detail: `Receita de ${formatBRL(totals.income)} e gasto de ${formatBRL(totals.expense)}.`,
    });
  }

  return out.slice(0, 6);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
