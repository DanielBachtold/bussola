'use server';

import { revalidatePath } from 'next/cache';
import { pool, withTransaction, type Queryable } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { parseAmount } from '@/lib/money';
import { quickParse, signedAmount } from '@/lib/quickparse';
import { isValidISO } from '@/lib/dates';
import { listRules, patternFromDescription, upsertRule } from '@/lib/rules';
import {
  accentInsensitiveRegex, createTransaction, deleteInstallmentGroup, deleteTransaction, getTransaction, listAccounts, listCategories, restoreTransactions, updateTransaction,
  type TransactionRow,
} from '@/lib/queries';
import type { TxKind } from '@/lib/types';

function revalidateAll() {
  for (const p of ['/', '/transacoes', '/faturas', '/revisar', '/lancar', '/investimentos']) revalidatePath(p);
}

export type ActionState = { ok?: boolean; error?: string; message?: string; ids?: number[]; installments?: number; removed?: TransactionRow[]; applied?: number };

/** Lançamento pela barra rápida: a frase já foi interpretada no cliente e confirmada. */
export async function quickAdd(text: string, overrides: { accountId?: number; categoryId?: number | null; tripId?: number | null; date?: string }): Promise<ActionState> {
  await requireSession();
  const [accounts, categories, rules] = await Promise.all([listAccounts(), listCategories(), listRules(pool)]);
  const parsed = quickParse(text, accounts, categories, rules);
  if (!parsed) return { error: 'Não encontrei um valor na frase.' };
  const accountId = overrides.accountId ?? parsed.account?.id;
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { error: 'Escolha a conta.' };
  const categoryId = overrides.categoryId !== undefined ? overrides.categoryId : parsed.category?.id ?? null;
  // a data mostrada na prévia (calculada no navegador) vale mais que a recalculada aqui
  const date = overrides.date && isValidISO(overrides.date) ? overrides.date : parsed.date;
  // o sinal depende da conta que vai receber o lançamento, que pode ter sido trocada na prévia
  const amount = signedAmount(Math.abs(parsed.amount), parsed.kind, parsed.direction, account);

  const created = await createTransaction({
    accountId: account.id,
    date,
    amount,
    description: parsed.description,
    categoryId,
    kind: parsed.kind,
    source: 'manual',
    installments: parsed.installments,
    tripId: overrides.tripId,
  });
  // aporte/resgate em investimento: registra também o outro lado na conta corrente, se houver só uma
  const checking = accounts.filter((a) => a.kind === 'checking');
  let mirror = '';
  const ids = [created[0].id];
  if (parsed.kind === 'transfer' && account.kind === 'investment' && checking.length === 1) {
    const [side] = await createTransaction({
      accountId: checking[0].id,
      date,
      amount: -amount,
      description: `${parsed.direction === 'out' ? 'Resgate' : 'Aporte'} ${account.name}`,
      kind: 'transfer',
      source: 'manual',
    });
    if (side) ids.push(side.id);
    mirror = ` e ${parsed.direction === 'out' ? 'a entrada em' : 'a saída de'} ${checking[0].name}`;
  }
  revalidateAll();
  const first = created[0];
  const trip = first.trip_name ? ` na viagem ${first.trip_name}` : '';
  return { ok: true, ids, installments: created.length, message: `${first.description} registrado em ${first.account_name}${created.length > 1 ? ` (${created.length} parcelas)` : ''}${trip}${mirror}.` };
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
    // sinal: gasto sai; receita entra; transferência sai da conta de origem (e entra na de destino, se houver)
    const toAccountId = kind === 'transfer' ? Number(formData.get('to_account_id')) || null : null;
    const amount = kind === 'expense' ? -raw : kind === 'income' ? raw : -raw;
    const categoryRaw = formData.get('category_id');
    const date = String(formData.get('date'));
    const description = String(formData.get('description') ?? '').trim() || 'Sem descrição';
    const notes = String(formData.get('notes') ?? '').trim() || null;
    await createTransaction({
      accountId,
      date,
      amount,
      description,
      categoryId: categoryRaw ? Number(categoryRaw) : null,
      kind,
      source: 'manual',
      installments: Number(formData.get('installments') ?? 1) || 1,
      notes,
      tripId: (() => { const v = formData.get('trip_id'); return v === null || v === 'auto' ? undefined : v === '' ? null : Number(v); })(),
    });
    if (toAccountId && accounts.some((a) => a.id === toAccountId)) {
      await createTransaction({ accountId: toAccountId, date, amount: raw, description, kind: 'transfer', source: 'manual', notes, tripId: null });
    }
    revalidateAll();
    return { ok: true, message: toAccountId ? 'Transferência registrada nas duas contas.' : 'Lançamento registrado.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao registrar.' };
  }
}

/**
 * Regra recém-aprendida aplicada ao que ainda está na fila de revisão com o mesmo
 * padrão: "UBER *TRIP" cinco vezes vira um toque só. Devolve quantos foram.
 */
async function applyRuleToQueue(db: Queryable, pattern: string, exceptId: number, categoryId: number | null, kind: TxKind | null): Promise<number> {
  // mesma fronteira de palavra do applyRules, ignorando acentos dos dois lados
  // o padrão vem sem pontuação ("uber trip"); no extrato pode haver "UBER *TRIP", "UBER-TRIP"
  const re = `(^|[^[:alnum:]])${accentInsensitiveRegex(pattern).replace(/ /g, '[^[:alnum:]]+')}([^[:alnum:]]|$)`;
  const { rowCount } = await db.query(
    `UPDATE transactions SET category_id = COALESCE($3, category_id), kind = COALESCE($4, kind), reviewed = TRUE, updated_at = NOW()
     WHERE reviewed = FALSE AND id <> $1 AND category_id IS NULL
       AND coalesce(statement_description, description) ~* $2`,
    [exceptId, re, categoryId, kind],
  );
  return rowCount ?? 0;
}

export async function setCategory(id: number, categoryId: number | null, learn: boolean): Promise<ActionState> {
  await requireSession();
  const tx = await getTransaction(id);
  if (!tx) return { error: 'Lançamento não encontrado.' };
  let applied = 0;
  await withTransaction(async (db) => {
    await updateTransaction(id, { categoryId, reviewed: true }, db);
    if (learn && categoryId) {
      const pattern = patternFromDescription(tx.statement_description ?? tx.description);
      if (pattern) {
        await upsertRule(db, pattern, categoryId, null);
        applied = await applyRuleToQueue(db, pattern, id, categoryId, null);
      }
    }
    // aplica nas demais parcelas do mesmo grupo
    if (tx.installment_group) {
      await db.query(`UPDATE transactions SET category_id = $2, reviewed = TRUE WHERE installment_group = $1`, [tx.installment_group, categoryId]);
    }
  });
  revalidateAll();
  return { ok: true, applied };
}

export async function setKind(id: number, kind: TxKind, learn: boolean): Promise<ActionState> {
  await requireSession();
  const tx = await getTransaction(id);
  if (!tx) return { error: 'Lançamento não encontrado.' };
  // trocar o tipo corrige o sinal: gasto sempre sai, receita sempre entra; transferência mantém
  const amount = kind === 'expense' ? -Math.abs(tx.amount) : kind === 'income' ? Math.abs(tx.amount) : tx.amount;
  let applied = 0;
  await withTransaction(async (db) => {
    await updateTransaction(id, { kind, amount, reviewed: true, categoryId: kind === 'transfer' ? null : tx.category_id }, db);
    if (learn && kind === 'transfer') {
      const pattern = patternFromDescription(tx.statement_description ?? tx.description);
      if (pattern) {
        await upsertRule(db, pattern, null, 'transfer');
        applied = await applyRuleToQueue(db, pattern, id, null, 'transfer');
      }
    }
  });
  revalidateAll();
  return { ok: true, applied };
}

/** Marca tudo que sobrou na fila como revisado, sem mexer em categoria. */
export async function markAllReviewed(): Promise<ActionState> {
  await requireSession();
  const { rowCount } = await pool.query(`UPDATE transactions SET reviewed = TRUE, updated_at = NOW() WHERE reviewed = FALSE`);
  revalidateAll();
  return { ok: true, applied: rowCount ?? 0, message: `${rowCount ?? 0} marcados como revisados.` };
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

/** Exclui e devolve as linhas apagadas, pra tela oferecer "desfazer". */
export async function removeTransaction(id: number, wholeGroup = false): Promise<ActionState> {
  await requireSession();
  const tx = await getTransaction(id);
  if (!tx) return { error: 'Lançamento não encontrado.' };
  const removed = wholeGroup && tx.installment_group
    ? await deleteInstallmentGroup(tx.installment_group, tx.installment_n ?? 1)
    : await deleteTransaction(id);
  revalidateAll();
  return { ok: true, removed };
}

export async function undoRemove(rows: TransactionRow[]): Promise<ActionState> {
  await requireSession();
  const n = await restoreTransactions(rows);
  revalidateAll();
  return { ok: true, message: n === 1 ? 'Lançamento restaurado.' : `${n} lançamentos restaurados.` };
}

/** Confirma que um lançamento manual aconteceu mesmo sem aparecer no extrato (ex.: dinheiro vivo). */
export async function confirmWithoutStatement(id: number): Promise<ActionState> {
  await requireSession();
  await pool.query(`UPDATE transactions SET status = 'reconciled', updated_at = NOW() WHERE id = $1`, [id]);
  revalidateAll();
  return { ok: true };
}
