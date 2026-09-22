import { pool, type Queryable } from './db';
import { addMonths, currentMonth, formatMonth, invoiceDates, monthEnd, monthStart, todayISO, daysBetween } from './dates';
import { formatBRL } from './money';
import { categoryAverages, expensesByCategory, listAccounts, monthTotals } from './queries';

export type Insight = {
  tone: 'good' | 'warning' | 'neutral';
  title: string;
  detail: string;
  icon?: string | null;
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

  // categoria que mais subiu / caiu contra a média
  const deltas = byCat
    .filter((c) => c.category_id !== null && (avg.get(c.category_id) ?? 0) > 50)
    .map((c) => ({ ...c, avg: avg.get(c.category_id) ?? 0, delta: c.total - (avg.get(c.category_id) ?? 0) }))
    .sort((a, b) => b.delta - a.delta);
  const up = deltas[0];
  if (up && up.delta > 0 && up.delta / up.avg > 0.25) {
    out.push({
      tone: 'warning',
      icon: up.icon,
      title: `${up.name} subiu ${Math.round((up.delta / up.avg) * 100)}%`,
      detail: `${formatBRL(up.total)} contra média de ${formatBRL(up.avg)}, em ${up.count} lançamentos.`,
    });
  }
  const down = deltas[deltas.length - 1];
  if (down && down.delta < 0 && -down.delta / down.avg > 0.25 && down !== up) {
    out.push({
      tone: 'good',
      icon: down.icon,
      title: `${down.name} caiu ${Math.round((-down.delta / down.avg) * 100)}%`,
      detail: `${formatBRL(down.total)} contra média de ${formatBRL(down.avg)}.`,
    });
  }

  // orçamento estourado
  for (const c of byCat) {
    if (c.budget && c.total > c.budget) {
      out.push({
        tone: 'warning',
        icon: c.icon,
        title: `${c.name} passou do orçamento da categoria`,
        detail: `${formatBRL(c.total)} de ${formatBRL(c.budget)} (${Math.round((c.total / c.budget) * 100)}%).`,
      });
    }
  }

  // maior gasto único (fora os que se repetem todo mês, senão é sempre o aluguel)
  const { rows: biggest } = await db.query<{ description: string; amount: number; date: string; account_name: string }>(
    `SELECT t.description, t.amount, t.date, a.name AS account_name FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.kind = 'expense' AND t.date >= $1 AND t.date <= $2 AND t.installment_group IS NULL
       AND lower(t.description) NOT IN (
         SELECT lower(description) FROM transactions WHERE kind = 'expense' AND date >= $3
         GROUP BY 1 HAVING COUNT(DISTINCT date_trunc('month', date)) >= 3
       )
     ORDER BY t.amount ASC LIMIT 1`,
    [start, end, monthStart(addMonths(month, -3))],
  );
  if (biggest[0] && totals.expense > 0 && Math.abs(biggest[0].amount) / totals.expense > 0.15) {
    out.push({
      tone: 'neutral',
      title: `Maior gasto: ${biggest[0].description}`,
      detail: `${formatBRL(Math.abs(biggest[0].amount))} no ${biggest[0].account_name}, ${Math.round((Math.abs(biggest[0].amount) / totals.expense) * 100)}% do mês.`,
    });
  }

  // cobrança repetida: mesma descrição e mesmo valor duas vezes em poucos dias
  const { rows: dupes } = await db.query<{ description: string; amount: number; n: number; dates: string[] }>(
    `SELECT t.description, ABS(t.amount)::numeric AS amount, COUNT(*)::int AS n, array_agg(to_char(t.date, 'DD/MM') ORDER BY t.date) AS dates
     FROM transactions t
     WHERE t.kind = 'expense' AND t.date >= $1 AND t.date <= $2 AND t.installment_group IS NULL
     GROUP BY lower(t.description), t.description, ABS(t.amount)
     HAVING COUNT(*) > 1 AND MAX(t.date) - MIN(t.date) <= 3 AND ABS(t.amount) >= 20
     ORDER BY ABS(t.amount) * COUNT(*) DESC LIMIT 1`,
    [start, end],
  );
  if (dupes[0]) {
    out.push({
      tone: 'warning',
      title: `${dupes[0].description} apareceu ${dupes[0].n} vezes`,
      detail: `${formatBRL(dupes[0].amount)} em ${dupes[0].dates.join(' e ')}. Pode ser cobrança repetida; confira no extrato.`,
    });
  }

  // assinatura que subiu de preço: mesma descrição mensal com valor maior que antes
  const { rows: hikes } = await db.query<{ description: string; atual: number; antes: number }>(
    `WITH mensais AS (
       SELECT lower(description) AS key, MAX(description) AS description,
              MAX(ABS(amount)) FILTER (WHERE date >= $1 AND date <= $2)::numeric AS atual,
              AVG(ABS(amount)) FILTER (WHERE date < $1 AND date >= $3)::numeric AS antes,
              COALESCE(STDDEV_POP(ABS(amount)) FILTER (WHERE date < $1 AND date >= $3), 0)::numeric AS variacao,
              COUNT(DISTINCT date_trunc('month', date)) AS meses
       FROM transactions WHERE kind = 'expense' AND installment_group IS NULL AND date >= $3 AND date <= $2
       GROUP BY 1
     )
     SELECT description, atual, antes FROM mensais
     -- só o que tinha preço fixo antes (assinatura), não gasto que varia todo mês
     WHERE meses >= 3 AND atual IS NOT NULL AND antes IS NOT NULL AND variacao <= antes * 0.02
       AND atual > antes * 1.05 AND atual - antes >= 3
     ORDER BY atual - antes DESC LIMIT 1`,
    [start, end, monthStart(addMonths(month, -4))],
  );
  if (hikes[0]) {
    out.push({
      tone: 'warning',
      title: `${hikes[0].description} subiu de preço`,
      detail: `${formatBRL(hikes[0].atual)} agora, contra ${formatBRL(hikes[0].antes)} nos meses anteriores.`,
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

  return out.slice(0, 3);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
