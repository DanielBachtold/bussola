'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { parseAmount } from '@/lib/money';
import { createTransaction } from '@/lib/queries';
import type { ActionState } from './transactions';

function revalidate() {
  for (const p of ['/', '/viagens', '/transacoes', '/lancar', '/chat', '/faturas', '/revisar', '/importar', '/investimentos', '/config']) revalidatePath(p);
}

export async function saveTrip(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const id = formData.get('id') ? Number(formData.get('id')) : null;
    const name = String(formData.get('name') ?? '').trim();
    const start = String(formData.get('start_date') ?? '');
    const end = String(formData.get('end_date') ?? '');
    const budgetRaw = String(formData.get('budget') ?? '').trim();
    const budget = budgetRaw ? Math.abs(parseAmount(budgetRaw)) : 0;
    const notes = String(formData.get('notes') ?? '').trim() || null;
    if (!name) return { error: 'Dê um nome pra viagem.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { error: 'Informe as datas.' };
    if (end < start) return { error: 'A volta não pode ser antes da ida.' };
    if (id) await pool.query(`UPDATE trips SET name=$2, start_date=$3, end_date=$4, budget=$5, notes=$6 WHERE id=$1`, [id, name, start, end, budget, notes]);
    else await pool.query(`INSERT INTO trips (name, start_date, end_date, budget, notes) VALUES ($1,$2,$3,$4,$5)`, [name, start, end, budget, notes]);
    revalidate();
    return { ok: true, message: 'Viagem salva.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar.' };
  }
}

export async function deleteTrip(id: number): Promise<ActionState> {
  await requireSession();
  await pool.query(`DELETE FROM trips WHERE id = $1`, [id]);
  revalidate();
  return { ok: true };
}

/** Item pré-pago (passagem, hospedagem, retiro): fica ligado à viagem, mas fora do teto. */
export async function addPrepaid(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const tripId = Number(formData.get('trip_id'));
    const accountId = Number(formData.get('account_id'));
    const amount = Math.abs(parseAmount(String(formData.get('amount') ?? '0')));
    const description = String(formData.get('description') ?? '').trim();
    const date = String(formData.get('date') ?? '');
    const categoryRaw = formData.get('category_id');
    if (!tripId || !accountId || !amount || !description || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Preencha descrição, valor, data e conta.' };
    await createTransaction({
      accountId, date, amount: -amount, description, kind: 'expense', source: 'manual',
      categoryId: categoryRaw ? Number(categoryRaw) : null, tripId, tripExcluded: true,
      installments: Number(formData.get('installments') ?? 1) || 1,
    });
    revalidate();
    return { ok: true, message: 'Item registrado fora do teto.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao registrar.' };
  }
}

/** Liga/desliga um lançamento a uma viagem (e se conta no teto ou não). */
export async function setTransactionTrip(id: number, tripId: number | null, excluded: boolean): Promise<ActionState> {
  await requireSession();
  await pool.query(`UPDATE transactions SET trip_id = $2, trip_excluded = $3, updated_at = NOW() WHERE id = $1`, [id, tripId, tripId ? excluded : false]);
  revalidate();
  return { ok: true };
}
