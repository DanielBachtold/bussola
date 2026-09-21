/** Datas como string ISO (YYYY-MM-DD), sempre em horário local, sem fuso. */

export function todayISO(): string {
  return toISO(new Date());
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "2026-09" ou "2026-09-01" -> "2026-09-01" */
export function monthStart(month: string): string {
  return `${month.slice(0, 7)}-01`;
}

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return toISO(d).slice(0, 7);
}

export function addMonthsToDate(iso: string, n: number): string {
  const d = fromISO(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return toISO(target);
}

export function monthEnd(month: string): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number);
  return toISO(new Date(y, m, 0));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);
}

const monthNames = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthNamesLong = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function formatMonth(month: string, long = false): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number);
  if (!long) return `${monthNames[m - 1]}/${String(y).slice(2)}`;
  const name = monthNamesLong[m - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/**
 * Em qual fatura cai uma compra no cartão. A fatura é identificada pelo mês em
 * que ela FECHA: compra depois do dia de fechamento vai pra fatura do mês seguinte.
 */
export function invoiceMonthFor(purchaseISO: string, closingDay: number): string {
  const d = fromISO(purchaseISO);
  const month = toISO(d).slice(0, 7);
  return d.getDate() > closingDay ? addMonths(month, 1) : month;
}

/** Datas de fechamento e vencimento de uma fatura identificada pelo mês de fechamento. */
export function invoiceDates(invoiceMonth: string, closingDay: number, dueDay: number) {
  const closes = clampDay(invoiceMonth, closingDay);
  const dueMonth = dueDay > closingDay ? invoiceMonth : addMonths(invoiceMonth, 1);
  const due = clampDay(dueMonth, dueDay);
  return { closes, due };
}

function clampDay(month: string, day: number): string {
  const [y, m] = month.slice(0, 7).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return toISO(new Date(y, m - 1, Math.min(day, last)));
}
