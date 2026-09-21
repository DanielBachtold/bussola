'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { parseAmount } from '@/lib/money';
import { deleteSnapshot, upsertSnapshot } from '@/lib/queries';
import { withTransaction } from '@/lib/db';
import type { ActionState } from './transactions';

export async function saveSnapshot(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const accountId = Number(formData.get('account_id'));
    const asset = String(formData.get('asset') ?? '').trim();
    const month = String(formData.get('month') ?? '');
    const balance = parseAmount(String(formData.get('balance') ?? '0'));
    if (!accountId || !asset || !/^\d{4}-\d{2}/.test(month)) return { error: 'Preencha conta, ativo e mês.' };
    await upsertSnapshot({ accountId, asset, assetClass: String(formData.get('asset_class') ?? '').trim() || null, month, balance });
    revalidatePath('/investimentos');
    revalidatePath('/');
    return { ok: true, message: 'Posição salva.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar.' };
  }
}

export async function removeSnapshot(id: number): Promise<ActionState & { snapshot?: { accountId: number; asset: string; assetClass: string | null; month: string; balance: number } }> {
  await requireSession();
  const row = await deleteSnapshot(id);
  revalidatePath('/investimentos');
  revalidatePath('/');
  return row ? { ok: true, snapshot: { accountId: row.account_id, asset: row.asset, assetClass: row.asset_class, month: row.month, balance: row.balance } } : { error: 'Posição não encontrada.' };
}

export async function restoreSnapshot(s: { accountId: number; asset: string; assetClass: string | null; month: string; balance: number }): Promise<ActionState> {
  await requireSession();
  await upsertSnapshot(s);
  revalidatePath('/investimentos');
  revalidatePath('/');
  return { ok: true };
}

export type SnapshotRowInput = { accountId: number; asset: string; assetClass?: string | null; balance: string };

/** Posição do mês inteira num salvar só: cada linha preenchida vira um upsert; vazias são ignoradas. */
export async function saveSnapshots(month: string, rows: SnapshotRowInput[]): Promise<ActionState> {
  await requireSession();
  if (!/^\d{4}-\d{2}/.test(month)) return { error: 'Mês inválido.' };
  try {
    let n = 0;
    await withTransaction(async (db) => {
      for (const r of rows) {
        const asset = r.asset.trim();
        const raw = r.balance.trim();
        if (!r.accountId || !asset || !raw) continue;
        await upsertSnapshot({ accountId: r.accountId, asset, assetClass: r.assetClass?.trim() || null, month, balance: parseAmount(raw) }, db);
        n++;
      }
    });
    if (!n) return { error: 'Preencha pelo menos um saldo.' };
    revalidatePath('/investimentos');
    revalidatePath('/');
    return { ok: true, message: `${n} ${n === 1 ? 'posição salva' : 'posições salvas'}.`, applied: n };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar.' };
  }
}
