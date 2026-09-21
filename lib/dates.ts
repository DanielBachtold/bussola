/**
 * Datas como string ISO (YYYY-MM-DD). "Hoje" é sempre no fuso do usuário
 * (APP_TZ, padrão America/Sao_Paulo), não no fuso do servidor: na Vercel o
 * servidor roda em UTC e à noite já seria "amanhã".
 */

const APP_TZ = process.env.NEXT_PUBLIC_APP_TZ || process.env.APP_TZ || 'America/Sao_Paulo';

export function todayISO(): string {
  try {
    // en-CA formata como YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return toISO(new Date());
  }
}

/** Dia do mês de hoje no fuso do app. */
export function todayDay(): number {
  return Number(todayISO().slice(8, 10));
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

/** true se ano-mês-dia formam uma data real (rejeita 31/02, 15/13...). */
export function isValidISO(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate();
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

/** Fatura "aberta" hoje: a que ainda vai fechar (depois do dia de fechamento, é a do mês seguinte). */
export function openInvoiceMonth(closingDay: number): string {
  return todayDay() > closingDay ? addMonths(currentMonth(), 1) : currentMonth();
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
