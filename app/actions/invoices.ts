'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/session';
import { parseAmount } from '@/lib/money';
import { isValidISO, formatMonth } from '@/lib/dates';
import { createTransaction, getAccount } from '@/lib/queries';
import type { ActionState } from './transactions';

/**
 * Registra o pagamento de uma fatura: sai da conta corrente, entra no cartão,
 * as duas pernas como transferência pendente (o extrato concilia depois).
 */
export async function payInvoice(_prev: ActionState | undefined, formData: FormData): Promise<ActionState> {
  await requireSession();
  try {
    const cardId = Number(formData.get('card_id'));
    const fromId = Number(formData.get('from_account_id')) || null;
    const month = String(formData.get('month') ?? '');
    const date = String(formData.get('date') ?? '');
    const amount = Math.abs(parseAmount(String(formData.get('amount') ?? '0')));
    const card = await getAccount(cardId);
    if (!card || card.kind !== 'credit_card') return { error: 'Cartão não encontrado.' };
    if (!/^\d{4}-\d{2}/.test(month) || !isValidISO(date)) return { error: 'Data inválida.' };
    if (!amount) return { error: 'Informe o valor pago.' };
    const description = `Pagamento fatura ${card.name} ${formatMonth(month)}`;
    await createTransaction({ accountId: cardId, date, amount, description, kind: 'transfer', source: 'manual', tripId: null });
    if (fromId) await createTransaction({ accountId: fromId, date, amount: -amount, description, kind: 'transfer', source: 'manual', tripId: null });
    for (const p of ['/', '/faturas', '/transacoes', '/lancar']) revalidatePath(p);
    return { ok: true, message: 'Pagamento registrado.' };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao registrar.' };
  }
}
