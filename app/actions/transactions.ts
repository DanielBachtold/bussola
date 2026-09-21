'use server';

import { revalidatePath } from 'next/cache';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { parseAmount } from '@/lib/money';
import { quickParse } from '@/lib/quickparse';
import { listRules, patternFromDescription, upsertRule } from '@/lib/rules';
import {
  createTransaction, deleteInstallmentGroup, deleteTransaction, getTransaction, listAccounts, listCategories, updateTransaction,
} from '@/lib/queries';
import type { TxKind } from '@/lib/types';

function revalidateAll() {
  for (const p of ['/', '/transacoes', '/faturas', '/revisar', '/lancar', '/investimentos']) revalidatePath(p);
}

export type ActionState = { ok?: boolean; error?: string; message?: string };

/** Lançamento pela barra rápida: a frase já foi interpretada no cliente e confirmada. */
export async function quickAdd(text: string, overrides: { accountId?: number; categoryId?: number | null; tripId?: number | null }): Promise<ActionState> {
  await requireSession();
  const [accounts, categories, rules] = await Promise.all([listAccounts(), listCategories(), listRules(pool)]);
  const parsed = quickParse(text, accounts, categories, rules);
  if (!parsed) return { error: 'Não encontrei um valor na frase.' };
  const accountId = overrides.accountId ?? parsed.account?.id;
  if (!accountId) return { error: 'Escolha a conta.' };
  const categoryId = overrides.categoryId !== undefined ? overrides.categoryId : parsed.category?.id ?? null;

  const created = await createTransaction({
    accountId,
    date: parsed.date,
    amount: parsed.amount,
    description: parsed.description,
    categoryId,
    kind: parsed.kind,
    source: 'manual',
    installments: parsed.installments,
    tripId: overrides.tripId,
  });
  // aporte em investimento: registra também a saída da conta corrente, se houver só uma
  const target = accounts.find((a) => a.id === accountId);
  const checking = accounts.filter((a) => a.kind === 'checking');
  let mirror = '';
  if (parsed.kind === 'transfer' && target?.kind === 'investment' && parsed.amount > 0 && checking.length === 1) {
    await createTransaction({
      accountId: checking[0].id,
      date: parsed.date,
      amount: -parsed.amount,
      description: `Aporte ${target.name}`,
      kind: 'transfer',
      source: 'manual',
    });
    mirror = ` e a saída de ${checking[0].name}`;
  }
  revalidateAll();
  const first = created[0];
  const trip = first.trip_name ? ` na viagem ${first.trip_name}` : '';
  return { ok: true, message: `${first.description} registrado em ${first.account_name}${created.length > 1 ? ` (${created.length} parcelas)` : ''}${trip}${mirror}.` };
}

export async function addTransaction(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const kind = String(formData.get('kind') ?? 'expense') as TxKind;
    const raw = Math.abs(parseAmount(String(formData.get('amount') ?? '0')));
    if (!raw) return { error: 'Informe o valor.' };
    const accountId = Number(formData.get('account_id'));
    const accounts = await listAccounts();
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return { error: 'Escolha a conta.' };
    // sinal: gasto sai; receita entra; transferência entra em investimento e sai das demais
    const amount = kind === 'expense' ? -raw : kind === 'income' ? raw : account.kind === 'investment' ? raw : -raw;
    const categoryRaw = formData.get('category_id');
    await createTransaction({
      accountId,
      date: String(formData.get('date')),
      amount,
      description: String(formData.get('description') ?? '').trim() || 'Sem descrição',
      categoryId: categoryRaw ? Number(categoryRaw) : null,
      kind,
      source: 'manual',
      installments: Number(formData.get('installments') ?? 1) || 1,
      notes: String(formData.get('notes') ?? '').trim() || null,
      tripId: (() => { const v = formData.get('trip_id'); return v === null || v === 'auto' ? undefined : v === '' ? null : Number(v); })(),
    });
    revalidateAll();
    return { ok: true, message: 'Lançamento registrado.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao registrar.' };
  }
}

export async function setCategory(id: number, categoryId: number | null, learn: boolean): Promise<ActionState> {
  await requireSession();
  const tx = await getTransaction(id);
  if (!tx) return { error: 'Lançamento não encontrado.' };
  await withTransaction(async (db) => {
    await updateTransaction(id, { categoryId, reviewed: true }, db);
    if (learn && categoryId) {
      const pattern = patternFromDescription(tx.statement_description ?? tx.description);
      if (pattern) await upsertRule(db, pattern, categoryId, null);
    }
    // aplica nas demais parcelas do mesmo grupo
    if (tx.installment_group) {
      await db.query(`UPDATE transactions SET category_id = $2, reviewed = TRUE WHERE installment_group = $1`, [tx.installment_group, categoryId]);
    }
  });
  revalidateAll();
  return { ok: true };
}

export async function setKind(id: number, kind: TxKind, learn: boolean): Promise<ActionState> {
  await requireSession();
  const tx = await getTransaction(id);
  if (!tx) return { error: 'Lançamento não encontrado.' };
  await withTransaction(async (db) => {
    await updateTransaction(id, { kind, reviewed: true, categoryId: kind === 'transfer' ? null : tx.category_id }, db);
    if (learn && kind === 'transfer') {
      const pattern = patternFromDescription(tx.statement_description ?? tx.description);
      if (pattern) await upsertRule(db, pattern, null, 'transfer');
    }
  });
  revalidateAll();
  return { ok: true };
}

export async function markReviewed(id: number): Promise<ActionState> {
  await requireSession();
  await updateTransaction(id, { reviewed: true });
  revalidateAll();
  return { ok: true };
}

export async function editTransaction(id: number, patch: { date?: string; amount?: string; description?: string; categoryId?: number | null; kind?: TxKind; accountId?: number; notes?: string | null }): Promise<ActionState> {
  await requireSession();
  try {
    const tx = await getTransaction(id);
    if (!tx) return { error: 'Lançamento não encontrado.' };
    let amount: number | undefined;
    if (patch.amount !== undefined) {
      const raw = Math.abs(parseAmount(patch.amount));
      const kind = patch.kind ?? tx.kind;
      amount = kind === 'expense' ? -raw : kind === 'income' ? raw : Math.sign(tx.amount) * raw || -raw;
    }
    await updateTransaction(id, { ...patch, amount });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao editar.' };
  }
}

export async function removeTransaction(id: number, wholeGroup = false): Promise<ActionState> {
  await requireSession();
  const tx = await getTransaction(id);
  if (!tx) return { error: 'Lançamento não encontrado.' };
  if (wholeGroup && tx.installment_group) await deleteInstallmentGroup(tx.installment_group, tx.installment_n ?? 1);
  else await deleteTransaction(id);
  revalidateAll();
  return { ok: true };
}

/** Confirma que um lançamento manual aconteceu mesmo sem aparecer no extrato (ex.: dinheiro vivo). */
export async function confirmWithoutStatement(id: number): Promise<ActionState> {
  await requireSession();
  await pool.query(`UPDATE transactions SET status = 'reconciled', updated_at = NOW() WHERE id = $1`, [id]);
  revalidateAll();
  return { ok: true };
}
