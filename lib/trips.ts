import { pool, type Queryable } from './db';
import { daysBetween, todayISO } from './dates';
import { formatBRL } from './money';
import { getSetting } from './budget';
import { listTransactions } from './queries';
import type { Transaction, Trip } from './types';

/**
 * Viagens: um período com teto de gastos. O que for lançado nas datas da
 * viagem (fora as categorias fixas) entra no teto; passagem, hospedagem
 * paga antes e afins ficam ligados à viagem mas "fora do teto".
 */

export type TripStatus = {
  trip: Trip;
  spent: number;
  prepaid: number;
  pct: number;
  status: 'ok' | 'warn' | 'over' | 'none';
  phase: 'upcoming' | 'active' | 'past';
  daysTotal: number;
  daysElapsed: number;
  daysLeft: number;
  perDaySoFar: number;
  perDayAllowed: number | null;
  expenses: Transaction[];
  prepaidItems: Transaction[];
};

export type TripAlert = { tone: 'warning' | 'bad'; title: string; detail: string; href: string };

export async function listTrips(db: Queryable = pool): Promise<Trip[]> {
  const { rows } = await db.query<Trip>(`SELECT * FROM trips ORDER BY start_date DESC`);
  return rows;
}

export async function getTrip(id: number, db: Queryable = pool): Promise<Trip | null> {
  const { rows } = await db.query<Trip>(`SELECT * FROM trips WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function tripsAround(date: string = todayISO(), db: Queryable = pool): Promise<Trip[]> {
  // ativas hoje ou começando nos próximos 30 dias
  const { rows } = await db.query<Trip>(
    `SELECT * FROM trips WHERE end_date >= $1::date AND start_date <= $1::date + INTERVAL '30 days' ORDER BY start_date`, [date],
  );
  return rows;
}

export async function tripStatus(trip: Trip, db: Queryable = pool): Promise<TripStatus> {
  const today = todayISO();
  const all = await listTransactions({ tripId: trip.id, limit: 2000 }, db);
  const expenses = all.filter((t) => t.kind === 'expense' && !t.trip_excluded);
  const prepaidItems = all.filter((t) => t.trip_excluded);
  const spent = expenses.reduce((a, t) => a + Math.abs(t.amount), 0);
  const prepaid = prepaidItems.reduce((a, t) => a + Math.abs(t.amount), 0);
  const threshold = Math.min(Math.max(Number((await getSetting('alert_threshold', db)) ?? 80) / 100, 0.1), 1);

  const daysTotal = daysBetween(trip.start_date, trip.end_date) + 1;
  const phase: TripStatus['phase'] = today < trip.start_date ? 'upcoming' : today > trip.end_date ? 'past' : 'active';
  const daysElapsed = phase === 'upcoming' ? 0 : phase === 'past' ? daysTotal : daysBetween(trip.start_date, today) + 1;
  const daysLeft = daysTotal - daysElapsed;
  const pct = trip.budget > 0 ? spent / trip.budget : 0;
  const status: TripStatus['status'] = trip.budget <= 0 ? 'none' : pct > 1 ? 'over' : pct >= threshold ? 'warn' : 'ok';

  return {
    trip, spent, prepaid, pct, status, phase, daysTotal, daysElapsed, daysLeft,
    perDaySoFar: daysElapsed ? spent / daysElapsed : 0,
    perDayAllowed: trip.budget > 0 && daysLeft > 0 ? Math.max(trip.budget - spent, 0) / daysLeft : null,
    expenses, prepaidItems,
  };
}

/** Alertas das viagens ativas (ou recém-terminadas há até 7 dias), pra faixa do topo. */
export async function tripAlerts(db: Queryable = pool): Promise<TripAlert[]> {
  const today = todayISO();
  const { rows } = await db.query<Trip>(`SELECT * FROM trips WHERE start_date <= $1::date AND end_date >= $1::date - INTERVAL '7 days' ORDER BY start_date`, [today]);
  const out: TripAlert[] = [];
  for (const trip of rows) {
    const s = await tripStatus(trip, db);
    if (s.status === 'over') out.push({ tone: 'bad', href: `/viagens?v=${trip.id}`, title: `${trip.name}: passou do teto`, detail: `${formatBRL(s.spent)} de ${formatBRL(trip.budget)} (${Math.round(s.pct * 100)}%), ${formatBRL(s.spent - trip.budget)} acima.` });
    else if (s.status === 'warn') out.push({ tone: 'warning', href: `/viagens?v=${trip.id}`, title: `${trip.name}: chegando no teto`, detail: `${formatBRL(s.spent)} de ${formatBRL(trip.budget)} (${Math.round(s.pct * 100)}%)${s.daysLeft > 0 && s.perDayAllowed !== null ? `, sobram ${formatBRL(s.perDayAllowed)} por dia nos ${s.daysLeft} dias restantes` : ''}.` });
  }
  return out;
}
