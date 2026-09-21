'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { parseAmount } from '@/lib/money';
import { deleteSnapshot, upsertSnapshot } from '@/lib/queries';
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

export async function removeSnapshot(id: number): Promise<ActionState> {
  await requireSession();
  await deleteSnapshot(id);
  revalidatePath('/investimentos');
  return { ok: true };
}
