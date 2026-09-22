import { pool } from '@/lib/db';
import { addMonths, currentMonth, formatDate, formatMonth, isValidISO, todayISO } from '@/lib/dates';
import { formatBRL, parseAmount } from '@/lib/money';
import { normalizeText } from '@/lib/rules';
import { getBudgetStatus, listGroups, setSetting } from '@/lib/budget';
import { listTrips } from '@/lib/trips';

/**
 * Comandos que o chat executa sem IA: criar viagem com teto, mudar o teto,
 * definir a renda e mexer no percentual de um grupo. Tudo reversível na tela.
 */
export type CommandResult = { text: string } | null;

export async function tryCommand(question: string, n: string): Promise<CommandResult> {
  if (/\b(viajar|viagem)\b/.test(n) && /\b(vou|criar|cria|marcar|marca|registrar|registra|planejar|planeja)\b/.test(n)) return createTrip(question, n);
  if (/\b(teto|limite)\b.*\bviagem\b|\bviagem\b.*\b(teto|limite)\b/.test(n)) return changeTripBudget(question, n);
  if (/\b(minha renda|renda mensal|ganho por mes|recebo por mes)\b/.test(n)) return setIncome(n);
  if (/(\blimite\b|\bpercentual\b|\bporcentagem\b|%)/.test(n) && /(grupo|necessidades|lazer|educa|investimento)/.test(n)) return setGroupPercent(n);
  return null;
}

/** "vou viajar pro Paraguai de 15/10 a 07/11 com limite de 1000" */
async function createTrip(question: string, n: string): Promise<CommandResult> {
  const period = datePair(n);
  if (!period) return { text: 'Entendi que é viagem, mas não peguei as datas. Diga assim: "vou viajar de 15/10 a 07/11 com limite de 1000".' };
  const budget = moneyIn(n);
  const name = tripName(question) ?? 'Viagem';
  const { rows: clash } = await pool.query<{ name: string }>(`SELECT name FROM trips WHERE start_date <= $2 AND end_date >= $1`, [period.start, period.end]);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO trips (name, start_date, end_date, budget) VALUES ($1,$2,$3,$4) RETURNING id`,
    [name, period.start, period.end, budget ?? 0],
  );
  // gastos já lançados nas datas entram no teto (menos fixos e parcelas antigas)
  const { rowCount } = await pool.query(
    `UPDATE transactions t SET trip_id = $1
     WHERE t.kind = 'expense' AND t.trip_id IS NULL AND t.date BETWEEN $2 AND $3
       AND t.recurring_id IS NULL AND (t.installment_group IS NULL OR t.installment_n = 1)
       AND (t.category_id IS NULL OR t.category_id NOT IN (SELECT id FROM categories WHERE fixed = TRUE))`,
    [rows[0].id, period.start, period.end],
  );
  return {
    text: `Pronto: viagem ${name}, de ${formatDate(period.start)} a ${formatDate(period.end)}${budget ? `, com teto de ${formatBRL(budget)}` : ', sem teto (defina em Viagens)'}.`
      + (rowCount ? ` Já puxei ${rowCount} ${rowCount === 1 ? 'gasto lançado' : 'gastos lançados'} nessas datas.` : '')
      + (clash.length ? ` Atenção: o período se sobrepõe a ${clash.map((c) => c.name).join(', ')}.` : '')
      + ' O que você gastar nessas datas entra no teto sozinho e sai do orçamento do mês. Pra ajustar ou apagar, é em Viagens.',
  };
}

async function changeTripBudget(question: string, n: string): Promise<CommandResult> {
  const value = moneyIn(n);
  if (value === null) return { text: 'Diga o valor do teto, por exemplo: "muda o teto da viagem Paraguai para 1500".' };
  const trips = await listTrips();
  if (!trips.length) return { text: 'Você ainda não tem viagem cadastrada. Diga "vou viajar de 15/10 a 07/11 com limite de 1000".' };
  const named = trips.find((t) => n.includes(normalizeText(t.name)));
  const today = todayISO();
  const target = named ?? trips.find((t) => t.end_date >= today) ?? trips[0];
  await pool.query(`UPDATE trips SET budget = $2 WHERE id = $1`, [target.id, value]);
  return { text: `Teto da viagem ${target.name} agora é ${formatBRL(value)}.` };
}

async function setIncome(n: string): Promise<CommandResult> {
  const value = moneyIn(n);
  if (value === null) return { text: 'Diga o valor, por exemplo: "minha renda mensal é 9500".' };
  await setSetting('monthly_income', String(value));
  const status = await getBudgetStatus(currentMonth());
  return { text: `Renda mensal definida em ${formatBRL(value)}. Os limites dos grupos passam a sair daí: ${status.groups.map((g) => `${g.group.name} ${formatBRL(g.limit, { cents: false })}`).join(', ')}.` };
}

async function setGroupPercent(n: string): Promise<CommandResult> {
  const pct = /(\d{1,3})\s*%/.exec(n);
  if (!pct) return { text: 'Diga o percentual, por exemplo: "lazer com 15%".' };
  const groups = await listGroups();
  const target = groups.find((g) => n.includes(normalizeText(g.name).split(' ')[0]));
  if (!target) return { text: `Não achei o grupo. Os que existem são: ${groups.map((g) => g.name).join(', ')}.` };
  await pool.query(`UPDATE budget_groups SET percent = $2 WHERE id = $1`, [target.id, Number(pct[1])]);
  const status = await getBudgetStatus(currentMonth());
  const now = status.groups.find((g) => g.group.id === target.id);
  const soma = status.totalPercent;
  return { text: `${target.name} agora é ${pct[1]}% da renda${now ? `, ou seja ${formatBRL(now.limit, { cents: false })} por mês` : ''}.${soma !== 100 ? ` Os grupos somam ${soma}%.` : ''}` };
}

/** "de 15/10 a 07/11", "15/10 até 7/11", "de 15 de outubro a 7 de novembro" */
function datePair(n: string): { start: string; end: string } | null {
  const num = [...n.matchAll(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/g)];
  if (num.length >= 2) {
    const a = fromParts(num[0]), b = fromParts(num[1]);
    if (a && b) return order(a, b);
  }
  const MES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const named = [...n.matchAll(/\b(\d{1,2})\s*(?:de\s+)?([a-zç]{3,})/g)]
    .map((m) => ({ day: Number(m[1]), month: MES.findIndex((x) => x.startsWith(normalizeText(m[2]).slice(0, 3))) + 1 }))
    .filter((x) => x.month > 0);
  if (named.length >= 2) {
    const a = withYear(named[0].month, named[0].day), b = withYear(named[1].month, named[1].day);
    if (a && b) return order(a, b);
  }
  return null;
}

function fromParts(m: RegExpMatchArray): string | null {
  const d = Number(m[1]), mo = Number(m[2]);
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
  if (y) { const s = iso(y, mo, d); return s; }
  return withYear(mo, d);
}

/** Sem ano na frase: usa o ano que deixa a data no futuro próximo. */
function withYear(month: number, day: number): string | null {
  const thisYear = Number(todayISO().slice(0, 4));
  const a = iso(thisYear, month, day);
  if (a && a >= addMonths(currentMonth(), -1) + '-01') return a;
  return iso(thisYear + 1, month, day);
}

function iso(y: number, m: number, d: number): string | null {
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISO(s) ? s : null;
}

function order(a: string, b: string) {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

function moneyIn(n: string): number | null {
  // ignora números que são data ou percentual
  const cleaned = n.replace(/\b\d{1,2}[\/.]\d{1,2}([\/.]\d{2,4})?\b/g, ' ').replace(/\d{1,3}\s*%/g, ' ');
  const m = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)\s*(?:reais|conto)?/.exec(cleaned);
  if (!m) return null;
  try {
    const v = Math.abs(parseAmount(m[1]));
    return v >= 1 ? v : null;
  } catch { return null; }
}

/** Nome da viagem: o que vem depois de "pro/para/em/viagem", sem as datas. */
function tripName(question: string): string | null {
  const m = /\b(?:viagem\s+(?:pro|para|para\s+o|a|à|ao|em|no|na)?|vou\s+(?:viajar|pra|para)\s*(?:pro|para|o|a|à|ao|em|no|na)?)\s+([A-Za-zÀ-ÿ][\wÀ-ÿ' ]{2,30})/i.exec(question);
  if (!m) return null;
  const name = m[1].split(/\b(de|dia|com|entre|até|ate|no periodo|no período)\b/i)[0].replace(/\s+/g, ' ').trim();
  if (name.length < 3 || /^\d/.test(name)) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export { formatMonth };
