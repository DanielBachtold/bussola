'use server';

import { revalidatePath } from 'next/cache';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { setSetting } from '@/lib/budget';
import type { ActionState } from './transactions';

function revalidate() {
  for (const p of ['/', '/revisar', '/transacoes', '/faturas', '/categorias', '/investimentos', '/config']) revalidatePath(p);
}

export type ReclassifyResult = ActionState & { changed?: number; before?: { id: number; kind: string; amount: number; category_id: number | null }[] };

/**
 * Marca um conjunto de lançamentos como transferência (ou devolve pra gasto/receita).
 * Guarda o estado anterior pra desfazer, e o sinal é reajustado pelo tipo da conta.
 */
export async function reclassify(ids: number[], kind: 'transfer' | 'expense' | 'income'): Promise<ReclassifyResult> {
  await requireSession();
  if (!ids.length) return { error: 'Nada selecionado.' };
  const changed = await withTransaction(async (db) => {
    const { rows: before } = await db.query<{ id: number; kind: string; amount: number; category_id: number | null; account_kind: string }>(
      `SELECT t.id, t.kind, t.amount, t.category_id, a.kind AS account_kind FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE t.id = ANY($1)`,
      [ids],
    );
    for (const r of before) {
      // gasto sai, receita entra; transferência mantém a direção que o extrato trouxe
      const abs = Math.abs(r.amount);
      const amount = kind === 'expense' ? -abs : kind === 'income' ? abs : r.amount;
      await db.query(
        `UPDATE transactions SET kind = $2, amount = $3, category_id = CASE WHEN $2 = 'transfer' THEN NULL ELSE category_id END, reviewed = TRUE, updated_at = NOW() WHERE id = $1`,
        [r.id, kind, amount],
      );
    }
    return before;
  });
  revalidate();
  return { ok: true, changed: changed.length, before: changed.map(({ id, kind: k, amount, category_id }) => ({ id, kind: k, amount, category_id })) };
}

export async function undoReclassify(before: { id: number; kind: string; amount: number; category_id: number | null }[]): Promise<ActionState> {
  await requireSession();
  await withTransaction(async (db) => {
    for (const r of before) {
      await db.query(`UPDATE transactions SET kind = $2, amount = $3, category_id = $4, updated_at = NOW() WHERE id = $1`, [r.id, r.kind, r.amount, r.category_id]);
    }
  });
  revalidate();
  return { ok: true, message: 'Desfeito.' };
}

/** "Isso é gasto mesmo": some da lista de sugestões sem mudar o lançamento. */
export async function dismissTransferPattern(key: string): Promise<ActionState> {
  await requireSession();
  const raw = (await pool.query<{ value: string }>(`SELECT value FROM settings WHERE key = 'transfer_dismissed'`)).rows[0]?.value;
  const list: string[] = raw ? JSON.parse(raw) : [];
  if (!list.includes(key)) list.push(key);
  await setSetting('transfer_dismissed', JSON.stringify(list));
  revalidate();
  return { ok: true };
}

export async function saveMyNames(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  await setSetting('my_names', String(formData.get('my_names') ?? '').trim() || null);
  revalidate();
  return { ok: true, message: 'Nomes salvos. Novas importações já usam isso; o que já entrou você resolve em Revisar.' };
}

/** Adiciona um nome à lista de "sou eu" e já marca como transferência o que casa com ele. */
export async function addMyName(name: string): Promise<ActionState & { changed?: number }> {
  await requireSession();
  const current = (await pool.query<{ value: string }>(`SELECT value FROM settings WHERE key = 'my_names'`)).rows[0]?.value ?? '';
  const list = current.split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.some((n) => n.toLowerCase() === name.trim().toLowerCase())) list.push(name.trim());
  await setSetting('my_names', list.join(', '));
  revalidate();
  return { ok: true, message: `${name} é você. Agora os Pix entre suas contas param de contar como gasto.` };
}
