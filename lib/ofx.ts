import type { ParsedStatement, StatementLine } from './statement';

/**
 * Parser tolerante de OFX 1.x (SGML) e 2.x (XML). Os bancos brasileiros são
 * inconsistentes: tags sem fechamento, decimal com vírgula, datas com fuso.
 */
export function parseOFX(raw: string): ParsedStatement {
  const text = raw.replace(/\r\n?/g, '\n');
  const bodyStart = text.indexOf('<OFX>');
  const body = bodyStart >= 0 ? text.slice(bodyStart) : text;

  const isCreditCard = /<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(body);
  const lines: StatementLine[] = [];

  const trnRegex = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRN>\s*<\/BANKTRANLIST>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = trnRegex.exec(body)) !== null) {
    const block = m[1];
    const amount = parseOfxAmount(tag(block, 'TRNAMT'));
    const date = parseOfxDate(tag(block, 'DTPOSTED'));
    if (amount === null || !date) continue;
    const name = tag(block, 'NAME');
    const memo = tag(block, 'MEMO');
    const description = [name, memo].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || tag(block, 'TRNTYPE') || 'Sem descrição';
    lines.push({ fitid: tag(block, 'FITID') || null, date, amount, description });
  }

  const ledger = tagBlock(body, 'LEDGERBAL');
  const balance = ledger ? parseOfxAmount(tag(ledger, 'BALAMT')) : null;
  const balanceDate = ledger ? parseOfxDate(tag(ledger, 'DTASOF')) : null;

  const dates = lines.map((l) => l.date).sort();
  return {
    format: 'ofx',
    accountKind: isCreditCard ? 'credit_card' : /<STMTRS>|<BANKMSGSRSV1>/i.test(body) ? 'checking' : 'unknown',
    lines,
    periodStart: parseOfxDate(tag(body, 'DTSTART')) ?? dates[0] ?? null,
    periodEnd: parseOfxDate(tag(body, 'DTEND')) ?? dates[dates.length - 1] ?? null,
    balance,
    balanceDate,
    acctId: tag(body, 'ACCTID') || null,
  };
}

/** Valor de uma tag, com ou sem fechamento. */
function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}>([^<\\n]*)`, 'i');
  const m = re.exec(block);
  return m ? decodeEntities(m[1].trim()) : '';
}

function tagBlock(body: string, name: string): string | null {
  const re = new RegExp(`<${name}>([\\s\\S]*?)(?:</${name}>|<\\/(?:STMTRS|CCSTMTRS)>)`, 'i');
  const m = re.exec(body);
  return m ? m[1] : null;
}

function parseOfxAmount(s: string): number | null {
  if (!s) return null;
  let t = s.replace(/\s/g, '');
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function parseOfxDate(s: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
