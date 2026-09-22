import { extractText, getDocumentProxy } from 'unpdf';
import type { ParsedStatement, StatementLine } from './statement';
import { isValidISO } from './dates';

/**
 * Extrato ou fatura em PDF. Não existe padrão: cada banco imprime do seu jeito,
 * então aqui é heurística em cima do texto extraído. É o caminho de último caso;
 * OFX continua sendo o certo, porque traz identificador único por lançamento.
 */

const MONTHS: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

// linhas de resumo que não são lançamento
const SKIP = /\b(saldo\s+(final|anterior|do\s+dia|em)|total\s+(da\s+fatura|de|geral|gasto)|valor\s+total|subtotal|limite\s+(total|dispon)|pagamento\s+m[ií]nimo|melhor\s+dia|juros|encargos|iof\s+total|resumo|p[áa]gina|cnpj|ouvidoria|sac\b)/i;
const MONEY = /(-?\s*R?\$?\s*\d{1,3}(?:\.\d{3})*,\d{2}|-?\s*R?\$?\s*\d+,\d{2})/g;

export async function parsePDF(data: Uint8Array, filename = ''): Promise<ParsedStatement> {
  const doc = await getDocumentProxy(data);
  const { text } = await extractText(doc, { mergePages: true });
  const full = String(text).replace(/\r/g, '');
  const lines = full.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!lines.length) throw new Error('Não consegui ler texto neste PDF. Se ele for digitalizado (uma foto do extrato), exporte em OFX ou CSV.');

  const lower = full.toLowerCase();
  const isInvoice = /(fatura|cart[aã]o de cr[eé]dito|limite dispon)/.test(lower) && !/extrato de conta/.test(lower);
  // se houver coluna de saldo, o último número da linha é o saldo, não o valor
  const hasBalanceColumn = /\bsaldo\b/.test(lower) && !isInvoice;

  const year = guessYear(full);
  const parsed: StatementLine[] = [];
  for (const line of lines) {
    if (SKIP.test(line)) continue;
    const date = lineDate(line, year);
    if (!date) continue;
    const amounts = [...line.matchAll(MONEY)].map((m) => m[0]);
    if (!amounts.length) continue;
    const raw = hasBalanceColumn && amounts.length > 1 ? amounts[amounts.length - 2] : amounts[amounts.length - 1];
    const value = toNumber(raw);
    if (value === null || value === 0) continue;

    // descrição: a linha sem a data e sem os números
    let description = line;
    for (const a of amounts) description = description.replace(a, ' ');
    description = description
      .replace(/^\s*\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?/, '')
      .replace(/^\s*\d{1,2}\s+[a-zç]{3,}\.?/i, '')
      .replace(/\b[DC]\b\s*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (description.length < 2) description = 'Lançamento';

    parsed.push({ fitid: null, date, amount: signed(value, raw, line, isInvoice), description });
  }

  if (!parsed.length) {
    throw new Error('Li o PDF, mas não reconheci nenhuma linha de lançamento. Tente o OFX ou o CSV do mesmo período; se não houver, me mande este arquivo que eu ajusto o leitor.');
  }

  const dates = parsed.map((l) => l.date).sort();
  const period = /(\d{2}\/\d{2}\/\d{4})\s*(?:a|at[ée]|-)\s*(\d{2}\/\d{2}\/\d{4})/.exec(full);
  return {
    format: 'pdf',
    accountKind: isInvoice ? 'credit_card' : /extrato|conta corrente/.test(lower) ? 'checking' : 'unknown',
    lines: parsed,
    periodStart: period ? toISOFromBR(period[1]) : dates[0] ?? null,
    periodEnd: period ? toISOFromBR(period[2]) : dates[dates.length - 1] ?? null,
    balance: null,
    balanceDate: null,
    acctId: null,
    source: filename,
  };
}

/** Ano de referência: o do período/vencimento impresso, ou o ano corrente. */
function guessYear(text: string): number {
  const m = /(?:venc(?:imento)?|per[íi]odo|fechamento|data)\D{0,20}(\d{2})\/(\d{2})\/(\d{4})/i.exec(text)
    ?? /\b\d{2}\/\d{2}\/(\d{4})\b/.exec(text);
  if (m) return Number(m[m.length - 1]);
  const y = /\b(20\d{2})\b/.exec(text);
  return y ? Number(y[1]) : new Date().getFullYear();
}

function lineDate(line: string, year: number): string | null {
  // 02/09/2026 ou 02/09/26
  let m = /^\s*(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(line);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, Number(m[2]), Number(m[1]));
  }
  // 02/09 (sem ano)
  m = /^\s*(\d{1,2})[\/.](\d{1,2})(?!\d)/.exec(line);
  if (m) return iso(year, Number(m[2]), Number(m[1]));
  // 15 SET / 15 set. / 15 de setembro
  m = /^\s*(\d{1,2})\s*(?:de\s+)?([a-zç]{3,})/i.exec(line);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return iso(year, mon, Number(m[1]));
  }
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISO(s) ? s : null;
}

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) / 100 : null;
}

/**
 * Sinal: em extrato, "-" ou sufixo D é saída e C é entrada. Em fatura, o normal
 * é gasto (sai), e crédito só quando tem "-" ou é pagamento/estorno.
 */
function signed(value: number, raw: string, line: string, isInvoice: boolean): number {
  const negative = /-/.test(raw.trim()) || /(^|\s)-\s*R?\$/.test(line) || /\b\d,\d{2}\s*D\b/i.test(line);
  const credit = /\b\d,\d{2}\s*C\b/i.test(line) || /\b(pagamento recebido|estorno|cr[ée]dito de|devolu[cç][aã]o)\b/i.test(line);
  if (isInvoice) return negative || credit ? value : -value;
  if (credit) return value;
  return negative ? -value : value;
}

function toISOFromBR(d: string): string {
  const [dd, mm, yyyy] = d.split('/');
  return `${yyyy}-${mm}-${dd}`;
}
