'use client';

import { useActionState, useTransition } from 'react';
import { removeSnapshot, saveSnapshot } from '@/app/actions/investments';
import { formatBRL } from '@/lib/money';
import { formatMonth } from '@/lib/dates';
import type { Account, Snapshot } from '@/lib/types';

export function SnapshotForm({ accounts, defaultMonth, knownAssets }: { accounts: Account[]; defaultMonth: string; knownAssets: string[] }) {
  const [state, action, pending] = useActionState(saveSnapshot, undefined);
  return (
    <form action={action} className="grid grid-cols-2 gap-2 text-[13px]">
      <label className="flex flex-col gap-1 text-ink-3">Conta
        <select name="account_id" className="input">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Mês
        <input name="month" type="month" className="input" defaultValue={defaultMonth} required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Ativo
        <input name="asset" className="input" list="assets" placeholder="Tesouro Selic, CDB, ITSA4..." required />
        <datalist id="assets">{knownAssets.map((a) => <option key={a} value={a} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Classe
        <input name="asset_class" className="input" list="classes" placeholder="Renda fixa, Ações, FII..." />
        <datalist id="classes">{['Renda fixa', 'Ações', 'FII', 'Exterior', 'Cripto', 'Previdência', 'Caixa'].map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Saldo no fim do mês
        <input name="balance" className="input tabular" inputMode="decimal" placeholder="0,00" required />
      </label>
      {state?.error ? <p className="col-span-2 text-bad">{state.error}</p> : null}
      {state?.ok ? <p className="col-span-2 text-good">{state.message}</p> : null}
      <button className="btn btn-primary col-span-2" disabled={pending}>{pending ? 'Salvando...' : 'Salvar posição'}</button>
    </form>
  );
}

export function SnapshotTable({ snapshots }: { snapshots: Snapshot[] }) {
  const [pending, start] = useTransition();
  if (!snapshots.length) return <p className="text-sm text-ink-3">Nenhuma posição registrada.</p>;
  return (
    <table className="w-full text-[13px]">
      <thead className="text-ink-3 text-left"><tr><th className="py-1 font-medium">Mês</th><th className="py-1 font-medium">Conta</th><th className="py-1 font-medium">Ativo</th><th className="py-1 font-medium text-right">Saldo</th><th /></tr></thead>
      <tbody className="divide-y divide-border">
        {snapshots.map((s) => (
          <tr key={s.id}>
            <td className="py-1.5 capitalize">{formatMonth(s.month)}</td>
            <td className="py-1.5">{s.account_name}</td>
            <td className="py-1.5">{s.asset}{s.asset_class ? <span className="text-ink-3"> · {s.asset_class}</span> : null}</td>
            <td className="py-1.5 text-right tabular">{formatBRL(s.balance)}</td>
            <td className="py-1.5 text-right"><button className="text-bad text-[12px]" disabled={pending} onClick={() => { if (confirm('Remover?')) start(async () => { await removeSnapshot(s.id); }); }}>remover</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
