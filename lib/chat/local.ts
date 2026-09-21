import { addMonths, currentMonth, formatDate, formatMonth, invoiceDates, monthEnd, monthStart, openInvoiceMonth, todayISO, toISO, fromISO } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { computeInsights } from '@/lib/insights';
import { getBudgetStatus } from '@/lib/budget';
import { listTrips, tripStatus } from '@/lib/trips';
import { normalizeText } from '@/lib/rules';
import {
  categoryAverages, expensesByCategory, futureCommitments, invoiceSummaries, latestAllocation, listAccounts, listCategories,
  listTransactions, monthTotals, netWorthSeries, pendingReview,
} from '@/lib/queries';

/**
 * Chat sem IA: entende um conjunto de perguntas frequentes sobre as finanças
 * (por palavras-chave e período) e sobre o próprio sistema. Roda de graça,
 * direto no banco. Com ANTHROPIC_API_KEY o chat usa o modelo em vez disto.
 */

type Period = { start: string; end: string; label: string };

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function parsePeriod(n: string, opts: { preferFuture?: boolean } = {}): Period {
  const today = todayISO();
  const cm = currentMonth();
  const curYear = Number(cm.slice(0, 4));
  let m: RegExpExecArray | null;

  if (/\bhoje\b/.test(n)) return { start: today, end: today, label: 'hoje' };
  if (/\bontem\b/.test(n)) { const d = addDays(today, -1); return { start: d, end: d, label: 'ontem' }; }
  if ((m = /ultim[oa]s?\s+(\d+)\s+dias?/.exec(n))) { const s = addDays(today, -Number(m[1]) + 1); return { start: s, end: today, label: `últimos ${m[1]} dias` }; }
  if (/\bsemana\s+passada\b/.test(n)) { const s = addDays(today, -13); return { start: s, end: addDays(today, -7), label: 'na semana passada' }; }
  if (/\b(essa|esta|nesta|nessa)\s+semana\b|\bsemana\b/.test(n)) { const s = addDays(today, -6); return { start: s, end: today, label: 'últimos 7 dias' }; }
  if ((m = /ultim[oa]s?\s+(\d+)\s+mes(es)?/.exec(n))) { const k = Number(m[1]); return { start: monthStart(addMonths(cm, -(k - 1))), end: today, label: `últimos ${k} meses` }; }
  if (/\b(mes|mês)\s+passado\b|\bmes\s+anterior\b/.test(n)) { const p = addMonths(cm, -1); return { start: monthStart(p), end: monthEnd(p), label: formatMonth(p, true).toLowerCase() }; }
  if (/\bano\s+passado\b|\bano\s+anterior\b/.test(n)) { const y = curYear - 1; return { start: `${y}-01-01`, end: `${y}-12-31`, label: `em ${y}` }; }
  if ((m = /\b(\d{4})-(\d{2})\b/.exec(n))) { const mo = `${m[1]}-${m[2]}`; return { start: monthStart(mo), end: monthEnd(mo), label: formatMonth(mo, true).toLowerCase() }; }
  if ((m = /\b(\d{1,2})\/(\d{4})\b/.exec(n))) { const mo = `${m[2]}-${m[1].padStart(2, '0')}`; return { start: monthStart(mo), end: monthEnd(mo), label: formatMonth(mo, true).toLowerCase() }; }
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(?:em|de|no|durante)\\s+${MONTHS[i]}\\b(?:\\s+de\\s+(\\d{4}))?|\\b${MONTHS[i]}\\b(?:\\s+de\\s+(\\d{4}))?|\\b${MONTHS_SHORT[i]}\\/(\\d{2,4})\\b`);
    const mm = re.exec(n);
    if (mm) {
      const yRaw = mm[1] ?? mm[2] ?? mm[3];
      let year = curYear;
      if (yRaw) year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
      // "gastei em dezembro" em setembro é o dezembro passado; "fatura de outubro" é o outubro que vem
      else if (i + 1 > Number(cm.slice(5, 7)) && !opts.preferFuture) year -= 1;
      const mo = `${year}-${String(i + 1).padStart(2, '0')}`;
      return { start: monthStart(mo), end: monthEnd(mo), label: formatMonth(mo, true).toLowerCase() };
    }
  }
  if ((m = /\b(esse|este|neste|nesse|no)\s+ano\b/.exec(n))) return { start: `${curYear}-01-01`, end: today, label: `em ${curYear}` };
  if ((m = /\b(?:em|de|do ano de|no ano de|ano de)\s+(20[1-3]\d)\b/.exec(n)) || (m = /(?<!r\$\s?)\b(20[1-3]\d)\b/.exec(n))) {
    const y = m[1];
    return { start: `${y}-01-01`, end: y === String(curYear) ? today : `${y}-12-31`, label: `em ${y}` };
  }
  return { start: monthStart(cm), end: today, label: 'neste mês' };
}

function addDays(iso: string, n: number) { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); }

const STOP = new Set(['essa', 'esta', 'nessa', 'nesta', 'passada', 'proxima', 'proximo', 'ultima', 'anterior', 'quanto', 'quantos', 'quanta', 'gastei', 'gasto', 'gastos', 'gastando', 'paguei', 'pago', 'com', 'em', 'no', 'na', 'nos', 'nas', 'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'eu', 'ja', 'foi', 'esse', 'este', 'nesse', 'neste', 'mes', 'ano', 'passado', 'ultimos', 'ultimo', 'ultima', 'dias', 'meses', 'semana', 'hoje', 'ontem', 'total', 'ate', 'agora', 'me', 'diz', 'diga', 'fala', 'mostra', 'mostre', 'qual', 'quais', 'e', 'que', 'tenho', 'meu', 'minha', 'meus', 'minhas', 'por', 'pra', 'para', 'valor', 'soma', 'somando', 'durante', 'e', 'ou']);

export async function answerLocally(question: string): Promise<string> {
  const n = normalizeText(question).replace(/[?!.,;]/g, ' ').replace(/\s+/g, ' ').trim();
  const period = parsePeriod(n);
  const hasMoneyIntent = /\b(viagem|viagens|quanto|gastei|gasto|gastos|paguei|recebi|receita|sobrou|resultado|saldo|patrimonio|investid|fatura|parcela|maior|top|ranking|pendente|revisar|lista|mostra|quais|onde|resumo|insight|como esta|como ta|como anda)\b/.test(n);

  if (/^(oi|ola|eai|e ai|bom dia|boa tarde|boa noite|ajuda|help|socorro)\b/.test(n) || /o que voce (faz|sabe|responde)|o que da pra perguntar|pode me ajudar/.test(n)) return HELP;

  // pergunta sobre o funcionamento vence a de números: "como funciona a fatura" não é "qual a fatura"
  const asksHow = /\b(como funciona|como funcionam|o que e|o que sao|oque e|pra que serve|para que serve|como (eu )?(faco|uso|configuro|cadastro|importo|registro|lanco|crio|defino|ativo|instalo|troco|mudo))\b/.test(n);
  if (asksHow || !hasMoneyIntent) {
    const faq = answerFaq(n);
    if (faq) return faq;
  }

  // ---- viagens ----
  const tripsForIntent = /viagem|viagens|viajar|viajando/.test(n) ? await listTrips() : [];
  const namedTrip = tripsForIntent.find((t) => new RegExp(`\\b${normalizeText(t.name)}\\b`).test(n)) ?? null;
  if (/viagem|viagens|viajar|viajando/.test(n) && (namedTrip || !/\b(quanto|gastei|gasto|gastos|paguei)\b/.test(n))) {
    const trips = tripsForIntent;
    if (!trips.length) return 'Nenhuma viagem cadastrada. Em Viagens, crie uma com nome, ida, volta e teto de gastos. O que você lançar nas datas dela (fora as categorias fixas) entra no teto automaticamente.';
    const named = namedTrip;
    const today = todayISO();
    const pick = named ?? trips.find((t) => t.start_date <= today && t.end_date >= today) ?? trips.find((t) => t.start_date > today) ?? trips[0];
    const s = await tripStatus(pick);
    const phase = s.phase === 'active' ? `dia ${s.daysElapsed} de ${s.daysTotal}` : s.phase === 'upcoming' ? `começa em ${formatDate(pick.start_date)}` : 'já terminou';
    return `${pick.name} (${formatDate(pick.start_date)} a ${formatDate(pick.end_date)}, ${phase}): ${formatBRL(s.spent)} gastos de um teto de ${formatBRL(pick.budget)}${pick.budget ? ` (${Math.round(s.pct * 100)}%)` : ''}.` +
      (s.phase !== 'upcoming' ? ` Média de ${formatBRL(s.perDaySoFar)} por dia.` : '') +
      (s.perDayAllowed !== null && s.phase !== 'past' ? ` Pra fechar no teto, dá ${formatBRL(s.perDayAllowed)} por dia nos ${s.daysLeft} dias que faltam.` : '') +
      (s.status === 'over' ? ` Já passou ${formatBRL(s.spent - pick.budget)} do teto.` : '') +
      (s.prepaid ? ` Pré-pago fora do teto: ${formatBRL(s.prepaid)}.` : '') +
      (s.expenses.length ? `\n\nÚltimos gastos:\n${s.expenses.slice(0, 5).map((t) => `• ${formatDate(t.date).slice(0, 5)} ${t.description}: ${formatBRL(Math.abs(t.amount))}`).join('\n')}` : '');
  }

  // ---- orçamento por percentual ----
  if (/orcamento|\bmeta\b|metas|percentual|limite|estourei|estourou|passei do|dentro do/.test(n)) {
    const month = monthFromText(n, true) ?? currentMonth();
    const b = await getBudgetStatus(month);
    if (!b.groups.length) return 'Você ainda não configurou grupos de orçamento. Em Configurações > Orçamento por percentual, crie os grupos (ex.: Necessidades 40%, Lazer 15%, Educação 15%, Investimentos 30%) e ligue cada categoria a um grupo.';
    if (!b.base) return 'Os grupos existem, mas não tenho uma base de renda pra calcular os limites: defina a renda mensal em Configurações ou registre uma receita neste mês.';
    return `Orçamento de ${formatMonth(month, true).toLowerCase()}, base ${formatBRL(b.base)} (${b.baseSource}):\n${b.groups.map((g) => `• ${g.group.name} (${g.group.percent}%): ${formatBRL(g.spent)} de ${formatBRL(g.limit)}${g.status !== 'none' ? `, ${Math.round(g.pct * 100)}%` : ''}${g.status === 'over' ? (g.group.basis === 'investment' ? ', abaixo da meta' : ', estourou') : g.status === 'warn' ? ', perto do limite' : ''}`).join('\n')}${b.alerts.length ? '\n\n' + b.alerts.map((a) => `⚠ ${a.title}: ${a.detail}`).join('\n') : '\n\nTudo dentro do previsto.'}`;
  }

  // ---- fatura ----
  if (/\bfatura|\bvence|vencimento|pagar do cartao|proxima fatura|fatura aberta/.test(n)) {
    const cards = (await listAccounts()).filter((a) => a.kind === 'credit_card' && a.closing_day && a.due_day);
    if (!cards.length) return 'Você ainda não cadastrou nenhum cartão de crédito. Vá em Configurações, crie o cartão com dia de fechamento e vencimento, e as faturas aparecem sozinhas.';
    const summaries = await invoiceSummaries();
    const lines: string[] = [];
    for (const c of cards) {
      const open = openInvoiceMonth(c.closing_day!);
      const wanted = /\b(proxima|seguinte)\b/.test(n) ? addMonths(open, 1) : /mes passado|anterior|ultima fatura/.test(n) ? addMonths(open, -1) : monthFromText(n, true) ?? open;
      const { closes, due } = invoiceDates(wanted, c.closing_day!, c.due_day!);
      const s = summaries.find((x) => x.account_id === c.id && x.invoice_month === wanted);
      const status = wanted === open ? 'aberta' : wanted < open ? 'fechada' : 'futura';
      lines.push(`• ${c.name}, fatura ${formatMonth(wanted)} (${status}): ${formatBRL(s?.total ?? 0)} em ${s?.count ?? 0} compras. Fecha em ${formatDate(closes)} e vence em ${formatDate(due)}.`);
    }
    const commitments = await futureCommitments();
    const committed = commitments.reduce((a, c) => a + c.total, 0);
    return `${lines.join('\n')}${committed ? `\n\nParcelas já comprometidas nos próximos meses: ${formatBRL(committed)}.` : ''}`;
  }

  // ---- parcelas ----
  if (/parcel|comprometid|prestac/.test(n)) {
    const commitments = await futureCommitments();
    if (!commitments.length) return 'Nenhuma parcela futura registrada. Quando você lançar uma compra parcelada no cartão, cada parcela cai na fatura certa e aparece aqui.';
    const total = commitments.reduce((a, c) => a + c.total, 0);
    return `Você tem ${formatBRL(total)} comprometidos em parcelas futuras:\n${commitments.map((c) => `• ${formatMonth(c.month)}: ${formatBRL(c.total)} (${c.count} parcela${c.count > 1 ? 's' : ''})`).join('\n')}`;
  }

  // ---- investimentos ----
  if (/invest|patrimonio|aplicad|corretora|carteira|rendiment|rentabilidade/.test(n)) {
    const [alloc, series] = await Promise.all([latestAllocation(), netWorthSeries()]);
    if (!alloc.length) return 'Nenhuma posição de investimento registrada ainda. Em Investimentos, registre o saldo de cada ativo uma vez por mês; a evolução e a rentabilidade saem daí.';
    const total = alloc.reduce((a, s) => a + s.balance, 0);
    const last = series[series.length - 1], prev = series[series.length - 2];
    const ret = last && prev ? last.total - prev.total - last.contributions : null;
    const contributions = series.reduce((a, p) => a + p.contributions, 0);
    return `Patrimônio investido: ${formatBRL(total)} (posição de ${formatMonth(alloc[0].month)}).\n${alloc.slice(0, 8).map((s) => `• ${s.asset} (${s.account_name}): ${formatBRL(s.balance)}, ${Math.round((s.balance / total) * 100)}%`).join('\n')}${ret !== null ? `\n\nRendimento no último mês: ${formatBRL(ret)}. Aportes registrados: ${formatBRL(contributions)}.` : ''}`;
  }

  // ---- pendências ----
  if (/pendente|revisar|faltou registrar|nao registrei|conciliad/.test(n)) {
    const { unreviewed, unmatched } = await pendingReview();
    return `${unreviewed.length} lançamento${unreviewed.length === 1 ? '' : 's'} vieram do extrato sem categoria (${formatBRL(unreviewed.reduce((a, t) => a + Math.abs(t.amount), 0))}) e ${unmatched.length} que você registrou não apareceram no extrato. Resolva em Revisar.`;
  }

  // ---- saldo em conta ----
  if (/saldo (na|da|em) conta|quanto tenho na conta|saldo das contas|saldo atual/.test(n)) {
    const accounts = (await listAccounts()).filter((a) => a.kind === 'checking');
    const known = accounts.filter((a) => a.balance !== null);
    if (!known.length) return 'Ainda não sei o saldo das contas: ele vem do extrato OFX quando você importa (o arquivo traz o saldo do dia).';
    return known.map((a) => `• ${a.name}: ${formatBRL(a.balance)} em ${formatDate(a.balance_at!)}`).join('\n');
  }

  // ---- receita ----
  if (/recebi|receita|entrou|ganhei|salario|faturei/.test(n) && !/gastei/.test(n)) {
    const rows = await listTransactions({ start: period.start, end: period.end, kind: 'income', limit: 500 });
    const total = rows.reduce((a, t) => a + t.amount, 0);
    return `Receita ${period.label}: ${formatBRL(total)} em ${rows.length} lançamento${rows.length === 1 ? '' : 's'}.${rows.length ? '\n' + rows.slice(0, 6).map((t) => `• ${formatDate(t.date).slice(0, 5)} ${t.description}: ${formatBRL(t.amount)}`).join('\n') : ''}`;
  }

  // ---- resultado ----
  if (/sobrou|resultado|balanco|economizei|poupei|taxa de poupanca|saldo do mes/.test(n)) {
    const [inc, exp] = await Promise.all([
      listTransactions({ start: period.start, end: period.end, kind: 'income', limit: 2000 }),
      listTransactions({ start: period.start, end: period.end, kind: 'expense', limit: 2000 }),
    ]);
    const income = inc.reduce((a, t) => a + t.amount, 0);
    const expense = exp.reduce((a, t) => a + Math.abs(t.amount), 0);
    const result = income - expense;
    return `${period.label.charAt(0).toUpperCase() + period.label.slice(1)}: receita ${formatBRL(income)}, gasto ${formatBRL(expense)}, ${result >= 0 ? 'sobrou' : 'faltou'} ${formatBRL(Math.abs(result))}${income ? ` (${Math.round((result / income) * 100)}% da receita)` : ''}.`;
  }

  // ---- resumo / insights ----
  if (/resumo|panorama|visao geral|insight|como (esta|ta|anda|vai)|como estao/.test(n)) {
    const month = monthFromText(n) ?? currentMonth();
    const [totals, insights, avg] = await Promise.all([monthTotals(month), computeInsights(month), categoryAverages(month, 3)]);
    const avgTotal = [...avg.values()].reduce((a, b) => a + b, 0);
    return `${formatMonth(month, true)}: gasto ${formatBRL(totals.expense)}${avgTotal ? ` (média dos 3 meses anteriores: ${formatBRL(avgTotal)})` : ''}, receita ${formatBRL(totals.income)}, resultado ${formatBRL(totals.income - totals.expense)}.${insights.length ? '\n\n' + insights.map((i) => `• ${i.title}. ${i.detail}`).join('\n') : ''}`;
  }

  // ---- onde gastei mais / top ----
  if (/onde (gastei|gasto|foi)|no que (gastei|gasto)|com o que (gastei|gasto)|maior(es)? gasto|mais gast|\btop\b|ranking|por categoria|categorias/.test(n)) {
    const byCat = await expensesByCategory(period.start, period.end);
    if (!byCat.length) return `Nenhum gasto registrado ${period.label}.`;
    const total = byCat.reduce((a, c) => a + c.total, 0);
    const biggest = await listTransactions({ start: period.start, end: period.end, kind: 'expense', limit: 1 }).then((r) => r.sort((a, b) => a.amount - b.amount)[0]);
    return `Gasto ${period.label}: ${formatBRL(total)}.\n${byCat.slice(0, 6).map((c) => `• ${c.icon ?? ''} ${c.name}: ${formatBRL(c.total)} (${Math.round((c.total / total) * 100)}%, ${c.count} lançamentos)`.trim()).join('\n')}${biggest ? `\n\nMaior lançamento: ${biggest.description}, ${formatBRL(Math.abs(biggest.amount))} em ${formatDate(biggest.date)}.` : ''}`;
  }

  // ---- lista ----
  if (/\b(lista|listar|mostra|mostre|quais foram|quais sao)\b/.test(n)) {
    const { categoryId, term } = await detectSubject(n);
    const rows = await listTransactions({ start: period.start, end: period.end, kind: 'expense', categoryId, search: term ?? undefined, limit: 15 });
    if (!rows.length) return `Não achei lançamentos ${period.label}${term ? ` com "${term}"` : ''}.`;
    return `Lançamentos ${period.label}${term ? ` com "${term}"` : ''}:\n${rows.map((t) => `• ${formatDate(t.date).slice(0, 5)} ${t.description} (${t.account_name}): ${formatBRL(Math.abs(t.amount))}`).join('\n')}`;
  }

  // ---- quanto gastei [com X] ----
  if (/quanto|gastei|gasto|gastos|paguei/.test(n)) {
    const { categoryId, categoryName, term } = await detectSubject(n);
    const rows = await listTransactions({ start: period.start, end: period.end, kind: 'expense', categoryId, search: term ?? undefined, limit: 2000 });
    const total = rows.reduce((a, t) => a + Math.abs(t.amount), 0);
    const subject = categoryName ? `com ${categoryName}` : term ? `com "${term}"` : 'no total';
    if (!rows.length) return `Nenhum gasto ${subject} ${period.label}.`;
    const avg = categoryId && period.label === 'neste mês' ? (await categoryAverages(currentMonth(), 3)).get(categoryId) : null;
    return `Gasto ${subject} ${period.label}: ${formatBRL(total)} em ${rows.length} lançamento${rows.length === 1 ? '' : 's'}.${avg ? ` A média dos 3 meses anteriores é ${formatBRL(avg)}.` : ''}${rows.length <= 5 ? '\n' + rows.map((t) => `• ${formatDate(t.date).slice(0, 5)} ${t.description}: ${formatBRL(Math.abs(t.amount))}`).join('\n') : ''}`;
  }

  const faq = answerFaq(n);
  if (faq) return faq;
  return `Não entendi essa pergunta. ${HELP}`;
}

function monthFromText(n: string, preferFuture = false): string | null {
  const p = parsePeriod(n, { preferFuture });
  return p.label === 'neste mês' || p.label === 'hoje' || p.label === 'ontem' || p.label.startsWith('últimos') || p.label.startsWith('em ') ? null : p.start.slice(0, 7);
}

async function detectSubject(n: string): Promise<{ categoryId?: number; categoryName?: string; term: string | null }> {
  const categories = await listCategories();
  for (const c of categories) {
    const cn = normalizeText(c.name);
    if (new RegExp(`\\b${cn}\\b`).test(n) || (cn.endsWith('s') && new RegExp(`\\b${cn.slice(0, -1)}\\b`).test(n))) return { categoryId: c.id, categoryName: c.name, term: null };
  }
  // termo livre: o que sobra depois de tirar período e palavras de ligação
  let cleaned = n;
  for (const mo of [...MONTHS, ...MONTHS_SHORT]) cleaned = cleaned.replace(new RegExp(`\\b${mo}\\b`, 'g'), ' ');
  cleaned = cleaned.replace(/\b\d{4}(-\d{2})?\b|\b\d{1,2}\/\d{2,4}\b|\bultim[oa]s?\s+\d+\b|\b\d+\b/g, ' ');
  const words = cleaned.split(' ').filter((w) => w && !STOP.has(w));
  const term = words.join(' ').trim();
  return { term: term.length >= 3 ? term : null };
}

const HELP = `Sem chave de IA, eu respondo perguntas diretas sobre os seus números, por exemplo:
• quanto gastei este mês / com alimentação / com uber em agosto
• onde gastei mais nos últimos 3 meses
• quanto recebi este ano
• quanto sobrou mês passado
• qual a fatura aberta e quando vence
• quanto tenho em parcelas
• quanto tenho investido
• o que está pendente de revisar
• como está meu orçamento
• como está a viagem
• como está meu mês

E sobre o sistema: como importar extrato, como funciona a fatura, como categorizar, o que é transferência, como instalar no celular.`;

function answerFaq(n: string): string | null {
  const faq: Array<[RegExp, string]> = [
    [/import|extrato|ofx|csv/, 'Para importar: exporte o extrato do banco em OFX (todo banco tem essa opção; CSV também serve), vá em Importar extrato, escolha a conta e o arquivo. Você vê uma prévia com o que concilia com o que já lançou, o que é novo e o que já existia. Só depois de confirmar é gravado. Reimportar o mesmo arquivo não duplica nada, porque cada linha tem um identificador único.'],
    [/concilia/, 'Conciliação é o cruzamento entre o que você lançou durante o mês e o que veio no extrato. Mesmo valor, mesmo sinal e data até 4 dias de diferença viram um só lançamento, marcado como conciliado. O que veio no extrato sem par entra em Revisar como "faltou registrar". O que você lançou e não apareceu no extrato aparece em Revisar como "não apareceu".'],
    [/fatura|fechamento|vencimento|cartao de credito|cartao/, 'Cada cartão tem dia de fechamento e vencimento (em Configurações). A compra conta como gasto na data em que foi feita e cai na fatura que fecha depois dessa data: compra no dia 28 com fechamento dia 25 vai pra fatura do mês seguinte. O pagamento da fatura, no extrato da conta corrente, é uma transferência, não um gasto, senão contaria em dobro.'],
    [/parcel/, 'Compra parcelada gera uma linha por parcela, cada uma na sua fatura, com o mesmo grupo. O painel mostra o total já comprometido nos próximos meses. Para lançar: "notebook 2400 em 10x rico" na barra rápida, ou o campo Parcelas no formulário completo.'],
    [/categori|regra|aprend/, 'Cada lançamento tem uma categoria. Nas importações, o sistema aplica regras: se a descrição do extrato contém um padrão (ex.: "uber"), recebe a categoria. Quando você categoriza uma linha importada com "aprender esse padrão" ligado, a regra é criada sozinha. Você pode ver e editar as regras em Configurações.'],
    [/transferencia|aporte|pagamento de fatura|pix pra mim/, 'Transferência é dinheiro que muda de lugar sem sair do seu bolso: pagamento de fatura, aporte na corretora, resgate, Pix entre suas contas. Nunca entra como gasto nem como receita. Aportes em conta de investimento são somados como "aportes" na tela de Investimentos, e é assim que a rentabilidade é calculada.'],
    [/lancar|barra rapida|registrar|como (eu )?(anoto|lanco)/, 'Na tela Lançar, escreva como você falaria: "almoço 42 crédito rico", "mercado 350 em 3x", "recebi 5000 salário nubank", "ontem farmácia 89 débito". O sistema mostra o que entendeu (valor, conta, data, parcelas, categoria) e você confirma. Se preferir, há um formulário completo na mesma tela.'],
    [/investimento|posicao|patrimonio|rentabilidade/, 'Em Investimentos, uma vez por mês, registre o saldo de cada ativo (Tesouro, CDB, ações...). O sistema já conhece os aportes (transferências pra conta de investimento), então calcula o rendimento como variação de saldo menos aportes, e mostra a evolução e a alocação.'],
    [/tema|escuro|claro|dark|light/, 'O tema (automático, claro ou escuro) fica no menu lateral no computador e no menu "Mais" no celular. A escolha é salva no seu navegador.'],
    [/instalar|celular|pwa|tela de inicio|aplicativo|app\b/, 'No celular, abra o endereço no navegador e use "Adicionar à tela de início" (Safari: botão de compartilhar; Chrome: menu ⋮). Ele vira um app com ícone, sem barra de navegador.'],
    [/\bia\b|inteligencia|chave|api|anthropic|claude|modelo/, 'Este chat funciona em dois modos. Sem chave, como agora, entende um conjunto de perguntas fixas e responde direto do banco, de graça. Se você definir ANTHROPIC_API_KEY no servidor, ele passa a usar o Claude com ferramentas: responde qualquer pergunta consultando seus dados e registra lançamentos por conversa. Esse modo é pago por uso na API da Anthropic.'],
    [/senha|login|entrar|acesso/, 'O acesso é por senha única, definida na variável APP_PASSWORD do servidor. Para trocar, mude a variável e faça o deploy de novo.'],
    [/seguran|privacidade|dados|onde fica/, 'Seus dados ficam só no seu banco de dados (Postgres). O código é público, os dados não. Extratos nunca são guardados no servidor: o arquivo é lido, conciliado e descartado; só as transações ficam no banco.'],
    [/viagem|viajar/, 'Em Viagens você cria um período com teto próprio (nome, ida, volta, teto). Gastos lançados nas datas da viagem entram no teto sozinhos, exceto categorias marcadas como fixas (financiamento, faculdade, aluguel), que continuam no mês. Passagem e o que foi pago antes entram como "pré-pago", ligados à viagem mas fora do teto. Gastos da viagem também ficam fora dos grupos do orçamento mensal, pra não misturar. Há alerta no topo quando o teto está perto ou estourou, e a tela mostra quanto dá pra gastar por dia até a volta.'],
    [/orcamento|percentual|\bmeta\b|alerta/, 'Em Configurações > Orçamento por percentual você define a renda base e os grupos (ex.: Necessidades 40%, Lazer 15%, Educação 15%, Investimentos 30%), e liga cada categoria a um grupo. O limite de cada grupo é o percentual sobre a renda. Quando um grupo passa do percentual de aviso (padrão 80%) aparece uma faixa no topo de todas as telas; quando estoura, outra. Investimentos funciona ao contrário: é meta de aporte, e o aviso é por ficar abaixo dela no fim do mês.'],
    [/revisar|pendencia/, 'Revisar mostra duas listas: o que veio no extrato e você não tinha registrado (precisa de categoria) e o que você registrou e não apareceu no extrato (pode ser erro ou algo que ainda vai cair). Toque em cada linha pra resolver.'],
  ];
  if (!/\b(como|o que|oque|qual|onde|funciona|posso|consigo|da pra|explica|pra que|por que|porque)\b/.test(n)) return null;
  for (const [re, text] of faq) if (re.test(n)) return text;
  return null;
}
