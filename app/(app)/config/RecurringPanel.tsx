'use client';

import { useActionState, useState, useTransition } from 'react';
import { deleteRecurring, saveRecurring, toggleRecurring } from '@/app/actions/recurring';
import { formatBRL } from '@/lib/money';
import type { Account, Category, RecurringRule } from '@/lib/types';
import { useToast } from '@/components/Toast';

export function RecurringPanel({ rules, accounts, categories }: { rules: RecurringRule[]; accounts: Account[]; categories: Category[] }) {
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const total = rules.filter((r) => r.active && r.kind === 'expense').reduce((a, r) => a + Math.abs(r.amount), 0);
  return (
    <section id="fixos" className="card p-4 flex flex-col gap-3 scroll-mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Fixos do mês</h2>
          <p className="text-[13px] text-ink-2">Aluguel, financiamento, faculdade, assinaturas. Eu lanço no dia certo (fica &ldquo;sem extrato&rdquo; até o banco confirmar) e desconto do livre pra gastar antes de cair.</p>
        </div>
        <button className="btn btn-primary btn-sm shrink-0" onClick={() => setEditing('new')}>Novo fixo</button>
      </div>
      {rules.length ? <p className="text-[13px] text-ink-3">{formatBRL(total, { cents: false })} por mês em fixos ativos.</p> : null}
      <ul className="divide-y divide-border text-[14px]">
        {rules.map((r) => (
          <li key={r.id} className={`py-2.5 flex flex-wrap items-center gap-3 ${r.active ? '' : 'opacity-50'}`}>
            <span className="flex-1 min-w-[160px]">
              <span className="font-medium">{r.category_icon ? `${r.category_icon} ` : ''}{r.description}</span>
              <span className="block text-[12px] text-ink-3">dia {r.day_of_month} · {r.account_name}{r.category_name ? ` · ${r.category_name}` : ''}{r.kind === 'income' ? ' · receita' : r.kind === 'transfer' ? ' · transferência' : ''}</span>
            </span>
            <span className="font-semibold">{formatBRL(r.amount)}</span>
            <span className="flex gap-1">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(r)}>Editar</button>
              <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await toggleRecurring(r.id, !r.active); })}>{r.active ? 'Pausar' : 'Ativar'}</button>
              <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => { if (confirm(`Remover "${r.description}"?`)) start(async () => { const res = await deleteRecurring(r.id); toast(res.error ? { tone: 'bad', text: res.error } : { text: res.message ?? 'Removido.' }); }); }}>Remover</button>
            </span>
          </li>
        ))}
        {!rules.length ? <li className="py-2 text-ink-3 text-[13px]">Nenhum fixo cadastrado.</li> : null}
      </ul>
      {editing ? <RecurringForm key={editing === 'new' ? 'new' : editing.id} rule={editing === 'new' ? null : editing} accounts={accounts} categories={categories} close={() => setEditing(null)} /> : null}
    </section>
  );
}

function RecurringForm({ rule, accounts, categories, close }: { rule: RecurringRule | null; accounts: Account[]; categories: Category[]; close: () => void }) {
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveRecurring>> | undefined, fd: FormData) => {
    const r = await saveRecurring(prev, fd);
    if (r.ok) close();
    return r;
  }, undefined);
  const [kind, setKind] = useState(rule?.kind ?? 'expense');
  const cats = categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense'));
  return (
    <form action={action} className="rounded-xl bg-surface-2 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Descrição
        <input name="description" className="input" defaultValue={rule?.description ?? ''} placeholder="Aluguel, Financiamento do carro, Faculdade..." required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Valor
        <input name="amount" className="input" inputMode="decimal" defaultValue={rule?.amount ?? ''} placeholder="0,00" required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Dia do mês
        <input name="day_of_month" type="number" min={1} max={31} className="input" defaultValue={rule?.day_of_month ?? 10} required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Tipo
        <select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as RecurringRule['kind'])}>
          <option value="expense">Gasto</option>
          <option value="income">Receita</option>
          <option value="transfer">Transferência</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Conta
        <select name="account_id" className="input" defaultValue={rule?.account_id ?? accounts[0]?.id}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {kind !== 'transfer' ? (
        <label className="flex flex-col gap-1 text-ink-3 col-span-2">Categoria
          <select name="category_id" className="input" defaultValue={rule?.category_id ?? ''}>
            <option value="">Sem categoria</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
          </select>
        </label>
      ) : <div className="col-span-2" />}
      {state?.error ? <p className="col-span-full text-bad">{state.error}</p> : null}
      <div className="col-span-full flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Salvando...' : 'Salvar'}</button>
        <button type="button" className="btn btn-ghost" onClick={close}>Cancelar</button>
      </div>
    </form>
  );
}
