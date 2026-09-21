'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { parseAmount } from '@/lib/money';
import { postRecurring } from '@/lib/recurring';
import type { ActionState } from './transactions';

function revalidate() {
  for (const p of ['/', '/config', '/transacoes', '/lancar', '/revisar', '/chat']) revalidatePath(p);
}

export async function saveRecurring(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const id = formData.get('id') ? Number(formData.get('id')) : null;
    const description = String(formData.get('description') ?? '').trim();
    const amount = Math.abs(parseAmount(String(formData.get('amount') ?? '0')));
    const accountId = Number(formData.get('account_id'));
    const categoryRaw = formData.get('category_id');
    const kind = ['expense', 'income', 'transfer'].includes(String(formData.get('kind'))) ? String(formData.get('kind')) : 'expense';
    const day = Number(formData.get('day_of_month'));
    if (!description) return { error: 'Dê um nome (ex.: Aluguel).' };
    if (!amount) return { error: 'Informe o valor.' };
    if (!accountId) return { error: 'Escolha a conta.' };
    if (!Number.isInteger(day) || day < 1 || day > 31) return { error: 'Dia entre 1 e 31.' };
    if (id) {
      await pool.query(
        `UPDATE recurring_rules SET description=$2, amount=$3, account_id=$4, category_id=$5, kind=$6, day_of_month=$7 WHERE id=$1`,
        [id, description, amount, accountId, categoryRaw ? Number(categoryRaw) : null, kind, day],
      );
    } else {
      await pool.query(
        `INSERT INTO recurring_rules (description, amount, account_id, category_id, kind, day_of_month) VALUES ($1,$2,$3,$4,$5,$6)`,
        [description, amount, accountId, categoryRaw ? Number(categoryRaw) : null, kind, day],
      );
    }
    // se o dia já passou neste mês, lança agora
    await postRecurring();
    revalidate();
    return { ok: true, message: 'Fixo salvo.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar.' };
  }
}

export async function toggleRecurring(id: number, active: boolean): Promise<ActionState> {
  await requireSession();
  await pool.query(`UPDATE recurring_rules SET active = $2 WHERE id = $1`, [id, active]);
  revalidate();
  return { ok: true };
}

export async function deleteRecurring(id: number): Promise<ActionState> {
  await requireSession();
  await pool.query(`DELETE FROM recurring_rules WHERE id = $1`, [id]);
  revalidate();
  return { ok: true, message: 'Fixo removido. Os lançamentos já feitos continuam.' };
}
