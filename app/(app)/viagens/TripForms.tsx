'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addPrepaid, deleteTrip, saveTrip } from '@/app/actions/trips';
import { todayISO } from '@/lib/dates';
import type { Account, Category, Trip } from '@/lib/types';

export function TripForm({ trip, onDone }: { trip: Trip | null; onDone?: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveTrip>> | undefined, fd: FormData) => {
    const r = await saveTrip(prev, fd);
    if (r.ok) { onDone?.(); if (!trip) router.push('/viagens'); }
    return r;
  }, undefined);
  return (
    <form action={action} className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
      {trip ? <input type="hidden" name="id" value={trip.id} /> : null}
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Nome
        <input name="name" className="input" defaultValue={trip?.name ?? ''} placeholder="Paraguai, Europa, Retiro..." required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Ida
        <input name="start_date" type="date" className="input" defaultValue={trip?.start_date ?? ''} required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Volta
        <input name="end_date" type="date" className="input" defaultValue={trip?.end_date ?? ''} required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Teto de gastos durante a viagem
        <input name="budget" className="input tabular" inputMode="decimal" defaultValue={trip?.budget ?? ''} placeholder="ex.: 1000" />
        <span className="text-[11px]">Só o que você gasta lá. Passagem e o que já foi pago entram como pré-pago, fora do teto.</span>
      </label>
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Observações
        <input name="notes" className="input" defaultValue={trip?.notes ?? ''} />
      </label>
      {state?.error ? <p className="col-span-full text-bad">{state.error}</p> : null}
      {state?.ok ? <p className="col-span-full text-good">{state.message}</p> : null}
      <div className="col-span-full flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Salvando...' : trip ? 'Salvar' : 'Criar viagem'}</button>
        {onDone ? <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button> : null}
      </div>
    </form>
  );
}

export function TripActions({ trip }: { trip: Trip }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (editing) return <div className="rounded-xl bg-surface-2 p-4"><TripForm trip={trip} onDone={() => setEditing(false)} /></div>;
  return (
    <div className="flex gap-2">
      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Editar</button>
      <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => { if (confirm(`Excluir "${trip.name}"? Os lançamentos continuam existindo, só perdem o vínculo.`)) start(async () => { await deleteTrip(trip.id); router.push('/viagens'); }); }}>Excluir</button>
    </div>
  );
}

export function PrepaidForm({ tripId, accounts, categories }: { tripId: number; accounts: Account[]; categories: Category[] }) {
  const [state, action, pending] = useActionState(addPrepaid, undefined);
  const [accountId, setAccountId] = useState(String(accounts[0]?.id ?? ''));
  const account = accounts.find((a) => String(a.id) === accountId);
  return (
    <form action={action} className="grid grid-cols-2 gap-2 text-[13px]">
      <input type="hidden" name="trip_id" value={tripId} />
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Descrição
        <input name="description" className="input" placeholder="Passagem aérea" required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Valor
        <input name="amount" className="input tabular" inputMode="decimal" placeholder="0,00" required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Data do pagamento
        <input name="date" type="date" className="input" defaultValue={todayISO()} required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Conta
        <select name="account_id" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.filter((a) => a.kind !== 'investment').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Categoria
        <select name="category_id" className="input" defaultValue={categories.find((c) => c.name === 'Viagem')?.id ?? ''}>
          <option value="">Sem categoria</option>
          {categories.filter((c) => c.kind === 'expense').map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
        </select>
      </label>
      {account?.kind === 'credit_card' ? (
        <label className="flex flex-col gap-1 text-ink-3">Parcelas
          <input name="installments" type="number" min={1} max={48} defaultValue={1} className="input" />
        </label>
      ) : null}
      {state?.error ? <p className="col-span-2 text-bad">{state.error}</p> : null}
      {state?.ok ? <p className="col-span-2 text-good">{state.message}</p> : null}
      <button className="btn btn-primary col-span-2" disabled={pending}>{pending ? 'Salvando...' : 'Registrar fora do teto'}</button>
    </form>
  );
}
