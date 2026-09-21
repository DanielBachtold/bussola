'use client';

import { useActionState, useState } from 'react';
import { payInvoice } from '@/app/actions/invoices';
import { todayISO } from '@/lib/dates';
import type { Account } from '@/lib/types';

export function PayForm({ cardId, month, total, checking, defaultDate }: { cardId: number; month: string; total: number; checking: Account[]; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof payInvoice>> | undefined, fd: FormData) => {
    const r = await payInvoice(prev, fd);
    if (r.ok) setOpen(false);
    return r;
  }, undefined);
  if (!open) return <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Registrar pagamento</button>;
  return (
    <form action={action} className="rounded-xl bg-surface-2 p-3 grid grid-cols-2 gap-2 text-[13px] w-full">
      <input type="hidden" name="card_id" value={cardId} />
      <input type="hidden" name="month" value={month} />
      <label className="flex flex-col gap-1 text-ink-3">Valor pago
        <input name="amount" className="input !py-1.5" inputMode="decimal" defaultValue={String(total.toFixed(2)).replace('.', ',')} required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Data
        <input name="date" type="date" className="input !py-1.5" defaultValue={defaultDate <= todayISO() ? defaultDate : todayISO()} required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Saiu de
        <select name="from_account_id" className="input !py-1.5" defaultValue={checking[0]?.id ?? ''}>
          <option value="">Só registrar no cartão</option>
          {checking.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {state?.error ? <p className="col-span-2 text-bad">{state.error}</p> : null}
      <div className="col-span-2 flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? 'Salvando...' : 'Confirmar'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}
