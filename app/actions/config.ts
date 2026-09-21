'use server';

import { revalidatePath } from 'next/cache';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { parseAmount } from '@/lib/money';
import { recomputeInvoices } from '@/lib/reconcile';
import type { ActionState } from './transactions';

function revalidate() {
  for (const p of ['/', '/config', '/transacoes', '/faturas', '/lancar', '/importar', '/investimentos']) revalidatePath(p);
}

export async function saveAccount(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const id = formData.get('id') ? Number(formData.get('id')) : null;
    const kind = String(formData.get('kind'));
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return { error: 'Informe o nome da conta.' };
    const institution = String(formData.get('institution') ?? '').trim() || null;
    const closing = kind === 'credit_card' ? Number(formData.get('closing_day')) || null : null;
    const due = kind === 'credit_card' ? Number(formData.get('due_day')) || null : null;
    const limitRaw = String(formData.get('credit_limit') ?? '').trim();
    const limit = kind === 'credit_card' && limitRaw ? parseAmount(limitRaw) : null;
    if (kind === 'credit_card' && (!closing || !due)) return { error: 'Cartão precisa de dia de fechamento e vencimento.' };

    await withTransaction(async (db) => {
      if (id) {
        await db.query(
          `UPDATE accounts SET name=$2, kind=$3, institution=$4, closing_day=$5, due_day=$6, credit_limit=$7 WHERE id=$1`,
          [id, name, kind, institution, closing, due, limit],
        );
        await recomputeInvoices(id, db);
      } else {
        await db.query(
          `INSERT INTO accounts (name, kind, institution, closing_day, due_day, credit_limit) VALUES ($1,$2,$3,$4,$5,$6)`,
          [name, kind, institution, closing, due, limit],
        );
      }
    });
    revalidate();
    return { ok: true, message: 'Conta salva.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar.' };
  }
}

export async function archiveAccount(id: number, archived: boolean): Promise<ActionState> {
  await requireSession();
  await pool.query(`UPDATE accounts SET archived = $2 WHERE id = $1`, [id, archived]);
  revalidate();
  return { ok: true };
}

export async function saveCategory(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const id = formData.get('id') ? Number(formData.get('id')) : null;
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return { error: 'Informe o nome.' };
    const kind = String(formData.get('kind') ?? 'expense');
    const icon = String(formData.get('icon') ?? '').trim() || null;
    const budgetRaw = String(formData.get('budget') ?? '').trim();
    const budget = budgetRaw ? Math.abs(parseAmount(budgetRaw)) : null;
    if (id) await pool.query(`UPDATE categories SET name=$2, kind=$3, icon=$4, budget=$5 WHERE id=$1`, [id, name, kind, icon, budget]);
    else await pool.query(`INSERT INTO categories (name, kind, icon, budget) VALUES ($1,$2,$3,$4)`, [name, kind, icon, budget]);
    revalidate();
    return { ok: true, message: 'Categoria salva.' };
  } catch (err) {
    return { error: err instanceof Error && /unique/i.test(err.message) ? 'Já existe uma categoria com esse nome.' : 'Erro ao salvar.' };
  }
}

export async function deleteCategory(id: number): Promise<ActionState> {
  await requireSession();
  await pool.query(`DELETE FROM categories WHERE id = $1`, [id]);
  revalidate();
  return { ok: true };
}

export async function saveRule(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  const pattern = String(formData.get('pattern') ?? '').trim().toLowerCase();
  if (pattern.length < 2) return { error: 'Padrão muito curto.' };
  const target = String(formData.get('target') ?? '');
  const kind = target === 'transfer' ? 'transfer' : null;
  const categoryId = target && target !== 'transfer' ? Number(target) : null;
  if (!kind && !categoryId) return { error: 'Escolha a categoria ou "Transferência".' };
  await pool.query(`INSERT INTO category_rules (pattern, category_id, kind) VALUES ($1,$2,$3)`, [pattern, categoryId, kind]);
  revalidate();
  return { ok: true, message: 'Regra criada.' };
}

export async function deleteRule(id: number): Promise<ActionState> {
  await requireSession();
  await pool.query(`DELETE FROM category_rules WHERE id = $1`, [id]);
  revalidate();
  return { ok: true };
}
