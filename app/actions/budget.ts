'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { parseAmount } from '@/lib/money';
import { setSetting } from '@/lib/budget';
import type { ActionState } from './transactions';

function revalidate() {
  for (const p of ['/', '/config', '/chat', '/transacoes', '/lancar', '/faturas', '/revisar', '/importar', '/investimentos']) revalidatePath(p);
}

export async function saveBudgetSettings(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const incomeRaw = String(formData.get('monthly_income') ?? '').trim();
    const income = incomeRaw ? Math.abs(parseAmount(incomeRaw)) : null;
    const threshold = Number(formData.get('alert_threshold') ?? 80);
    if (!Number.isFinite(threshold) || threshold < 10 || threshold > 100) return { error: 'O aviso deve ficar entre 10% e 100%.' };
    await setSetting('monthly_income', income ? String(income) : null);
    await setSetting('alert_threshold', String(Math.round(threshold)));
    revalidate();
    return { ok: true, message: 'Orçamento salvo.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar.' };
  }
}

export async function saveGroup(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const id = formData.get('id') ? Number(formData.get('id')) : null;
    const name = String(formData.get('name') ?? '').trim();
    const percent = Number(String(formData.get('percent') ?? '').replace(',', '.'));
    const basis = formData.get('basis') === 'investment' ? 'investment' : 'expense';
    if (!name) return { error: 'Informe o nome do grupo.' };
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return { error: 'Percentual entre 0 e 100.' };
    if (id) await pool.query(`UPDATE budget_groups SET name=$2, percent=$3, basis=$4 WHERE id=$1`, [id, name, percent, basis]);
    else await pool.query(`INSERT INTO budget_groups (name, percent, basis, sort) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort),0)+1 FROM budget_groups))`, [name, percent, basis]);
    revalidate();
    return { ok: true, message: 'Grupo salvo.' };
  } catch (err) {
    return { error: err instanceof Error && /unique/i.test(err.message) ? 'Já existe um grupo com esse nome.' : 'Erro ao salvar.' };
  }
}

export async function deleteGroup(id: number): Promise<ActionState> {
  await requireSession();
  await pool.query(`DELETE FROM budget_groups WHERE id = $1`, [id]);
  revalidate();
  return { ok: true };
}

export async function assignCategoryGroup(categoryId: number, groupId: number | null): Promise<ActionState> {
  await requireSession();
  await pool.query(`UPDATE categories SET group_id = $2 WHERE id = $1`, [categoryId, groupId]);
  revalidate();
  return { ok: true };
}
