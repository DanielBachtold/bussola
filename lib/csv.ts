import type { ParsedStatement, StatementLine } from './statement';
import { parseAmount } from './money';

/**
 * CSV genérico de banco: detecta separador e acha as colunas de data,
 * descrição e valor pelo nome do cabeçalho. Cobre Nubank (conta e cartão),
 * XP/Rico e a maioria dos exports em português.
 */
export function parseCSV(raw: string): ParsedStatement {
  const text = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const rows = splitCSV(text);
  if (rows.length < 2) throw new Error('CSV vazio ou sem cabeçalho.');

  const header = rows[0].map((h) => normalize(h));
  const idx = {
    date: findCol(header, ['data', 'date', 'dt']),
    desc: findCol(header, ['descri', 'histor', 'lancamento', 'title', 'memo', 'estabelecimento', 'name', 'detalhe']),
    amount: findCol(header, ['valor', 'amount', 'value', 'vlr']),
    debit: findCol(header, ['debito', 'saida', 'debit']),
    credit: findCol(header, ['credito', 'entrada', 'credit']),
    id: findCol(header, ['identificador', 'id', 'fitid']),
  };
  if (idx.date < 0 || idx.desc < 0 || (idx.amount < 0 && idx.debit < 0 && idx.credit < 0)) {
    throw new Error(`Não reconheci as colunas do CSV. Cabeçalho: ${rows[0].join(' | ')}`);
  }

  const lines: StatementLine[] = [];
  for (const row of rows.slice(1)) {
    if (row.every((c) => !c.trim())) continue;
    const date = parseDate(row[idx.date] ?? '');
    if (!date) continue;
    let amount: number | null = null;
    try {
      if (idx.amount >= 0 && row[idx.amount]?.trim()) amount = parseAmount(row[idx.amount]);
      else {
        const deb = idx.debit >= 0 && row[idx.debit]?.trim() ? Math.abs(parseAmount(row[idx.debit])) : 0;
        const cred = idx.credit >= 0 && row[idx.credit]?.trim() ? Math.abs(parseAmount(row[idx.credit])) : 0;
        amount = cred - deb;
      }
    } catch {
      continue;
    }
    if (amount === null) continue;
    lines.push({
      fitid: idx.id >= 0 && row[idx.id]?.trim() ? row[idx.id].trim() : null,
      date,
      amount: Math.round(amount * 100) / 100,
      description: (row[idx.desc] ?? '').replace(/\s+/g, ' ').trim() || 'Sem descrição',
    });
  }

  const dates = lines.map((l) => l.date).sort();
  return {
    format: 'csv',
    accountKind: 'unknown',
    lines,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    balance: null,
    balanceDate: null,
  };
}

function splitCSV(text: string): string[][] {
  const firstLine = text.split('\n')[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function findCol(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = header.findIndex((h) => h === c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = header.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(t);
  if (m) return `20${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
