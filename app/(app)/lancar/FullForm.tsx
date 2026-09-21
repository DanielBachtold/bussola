'use client';

import { useActionState, useState } from 'react';
import { addTransaction } from '@/app/actions/transactions';
import { todayISO } from '@/lib/dates';
import type { Account, Category, Trip, TxKind } from '@/lib/types';

export function FullForm({ accounts, categories, trips = [] }: { accounts: Account[]; categories: Category[]; trips?: Trip[] }) {
  const [state, action, pending] = useActionState(addTransaction, undefined);
  const [kind, setKind] = useState<TxKind>('expense');
  const [accountId, setAccountId] = useState<string>(String(accounts[0]?.id ?? ''));
  const [toAccountId, setToAccountId] = useState<string>(String(accounts[1]?.id ?? ''));
  const account = accounts.find((a) => String(a.id) === accountId);
  // origem e destino nunca podem ser a mesma conta: ao trocar a origem, o destino pula pra outra
  const changeFrom = (v: string) => { setAccountId(v); if (v === toAccountId) setToAccountId(String(accounts.find((a) => String(a.id) !== v)?.id ?? '')); };
  const cats = categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense'));

  return (
    <form action={action} className="grid grid-cols-2 gap-3 text-[13px]">
      <label className="flex flex-col gap-1 col-span-2">
        <span className="text-ink-3">Tipo</span>
        <div className="flex gap-1">
          {(['expense', 'income', 'transfer'] as TxKind[]).map((k) => (
            <label key={k} className={`btn btn-sm flex-1 cursor-pointer ${kind === k ? 'btn-primary' : 'btn-ghost'}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === 'expense' ? 'Gasto' : k === 'income' ? 'Receita' : 'Transferência'}
            </label>
          ))}
        </div>
      </label>
      <label className="flex flex-col gap-1 col-span-2">
        <span className="text-ink-3">Descrição</span>
        <input name="description" className="input" required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-3">Valor</span>
        <input name="amount" className="input tabular" inputMode="decimal" placeholder="0,00" required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-3">Data</span>
        <input name="date" type="date" className="input" defaultValue={todayISO()} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-ink-3">{kind === 'transfer' ? 'Sai de' : 'Conta'}</span>
        <select name="account_id" className="input" value={accountId} onChange={(e) => changeFrom(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {kind === 'transfer' ? (
        <label className="flex flex-col gap-1">
          <span className="text-ink-3">Entra em</span>
          <select name="to_account_id" className="input" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            <option value="">Só registrar a saída</option>
            {accounts.filter((a) => String(a.id) !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      ) : null}
      {kind !== 'transfer' ? (
        <label className="flex flex-col gap-1">
          <span className="text-ink-3">Categoria</span>
          <select name="category_id" className="input" defaultValue="">
            <option value="">Sem categoria</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
          </select>
        </label>
      ) : <div />}
      {account?.kind === 'credit_card' && kind === 'expense' ? (
        <label className="flex flex-col gap-1">
          <span className="text-ink-3">Parcelas</span>
          <input name="installments" type="number" min={1} max={48} defaultValue={1} className="input" />
        </label>
      ) : null}
      {trips.length && kind === 'expense' ? (
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-ink-3">Viagem</span>
          <select name="trip_id" className="input" defaultValue="auto">
            <option value="auto">Automático (pela data e categoria)</option>
            <option value="">Nenhuma</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 col-span-2">
        <span className="text-ink-3">Observação</span>
        <input name="notes" className="input" />
      </label>
      {state?.error ? <p className="col-span-2 text-bad">{state.error}</p> : null}
      {state?.ok ? <p className="col-span-2 text-good">{state.message}</p> : null}
      <button className="btn btn-primary col-span-2" disabled={pending}>{pending ? 'Salvando...' : 'Registrar'}</button>
    </form>
  );
}
