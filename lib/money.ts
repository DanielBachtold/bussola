const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatBRL(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return brl.format(Number.isFinite(n) ? n : 0);
}

export function formatBRLCompact(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0);
  return brlCompact.format(Number.isFinite(n) ? n : 0);
}

/** Aceita "1.234,56", "1234.56", "R$ 45", "-12,5". */
export function parseAmount(input: string | number): number {
  if (typeof input === 'number') return input;
  let s = input.trim().replace(/[R$\s]/g, '');
  const negative = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'));
  s = s.replace(/[()\-+]/g, '');
  if (s.includes(',') && s.includes('.')) {
    // 1.234,56 (BR) ou 1,234.56 (US): o último separador é o decimal
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`Valor inválido: ${input}`);
  return negative ? -n : n;
}

export function toNumber(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
