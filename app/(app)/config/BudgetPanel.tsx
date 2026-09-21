'use client';

import { useActionState, useState, useTransition } from 'react';
import { assignCategoryGroup, deleteGroup, saveBudgetSettings, saveGroup } from '@/app/actions/budget';
import { formatBRL } from '@/lib/money';
import type { BudgetStatus } from '@/lib/budget';
import type { BudgetGroup, Category } from '@/lib/types';

export function BudgetPanel({ status, groups, categories, monthlyIncome, threshold }: { status: BudgetStatus; groups: BudgetGroup[]; categories: Category[]; monthlyIncome: string; threshold: number }) {
  const [settingsState, settingsAction, settingsPending] = useActionState(saveBudgetSettings, undefined);
  const [editing, setEditing] = useState<BudgetGroup | 'new' | null>(null);
  const [pending, start] = useTransition();
  const expenseCats = categories.filter((c) => c.kind === 'expense');

  return (
    <section id="orcamento" className="card p-4 flex flex-col gap-4 scroll-mt-4">
      <div>
        <h2 className="font-semibold">Orçamento por percentual</h2>
        <p className="text-[13px] text-ink-2">Defina quanto da renda vai pra cada grupo. O sistema avisa dentro do app quando um grupo chega perto do limite e quando passa.</p>
      </div>

      <form action={settingsAction} className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px] items-end">
        <label className="flex flex-col gap-1 text-ink-3 col-span-2">Renda mensal base (opcional)
          <input name="monthly_income" className="input tabular" inputMode="decimal" defaultValue={monthlyIncome} placeholder="ex.: 9500" />
          <span className="text-[11px]">Sem valor, uso a receita real do mês (e, antes de ela entrar, a média dos 3 anteriores). Base atual: {formatBRL(status.base)} ({status.baseSource}).</span>
        </label>
        <label className="flex flex-col gap-1 text-ink-3">Avisar a partir de
          <div className="flex items-center gap-1"><input name="alert_threshold" type="number" min={10} max={100} className="input tabular" defaultValue={threshold} /><span>%</span></div>
        </label>
        <button className="btn btn-primary" disabled={settingsPending}>{settingsPending ? 'Salvando...' : 'Salvar'}</button>
        {settingsState?.error ? <p className="col-span-full text-bad">{settingsState.error}</p> : null}
        {settingsState?.ok ? <p className="col-span-full text-good">{settingsState.message}</p> : null}
      </form>

      <div className="flex items-center justify-between">
        <p className="text-[13px]">
          Grupos <span className={`pill ml-1 ${status.totalPercent === 100 ? 'pill-good' : 'pill-warn'}`}>somam {status.totalPercent}%</span>
        </p>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>Novo grupo</button>
      </div>
      <ul className="divide-y divide-border text-[14px]">
        {groups.map((g) => {
          const st = status.groups.find((s) => s.group.id === g.id);
          return (
            <li key={g.id} className="py-2.5 flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-[180px]">
                <span className="font-medium">{g.name}</span> <span className="text-ink-3">· {g.percent}%{g.basis === 'investment' ? ' · meta de aporte' : ''}</span>
                {st ? <span className="block text-[12px] text-ink-3">limite {formatBRL(st.limit)} · usado {formatBRL(st.spent)}{st.status !== 'none' ? ` (${Math.round(st.pct * 100)}%)` : ''}</span> : null}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(g)}>Editar</button>
              <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => { if (confirm(`Excluir o grupo "${g.name}"? As categorias ficam sem grupo.`)) start(async () => { await deleteGroup(g.id); }); }}>Excluir</button>
            </li>
          );
        })}
        {!groups.length ? <li className="py-2 text-ink-3 text-[13px]">Nenhum grupo. Crie, por exemplo: Necessidades 40%, Lazer 15%, Educação 15%, Investimentos 30%.</li> : null}
      </ul>
      {editing ? <GroupForm key={editing === 'new' ? 'new' : editing.id} group={editing === 'new' ? null : editing} close={() => setEditing(null)} /> : null}

      <div>
        <p className="text-[12px] uppercase tracking-wide text-ink-3 font-medium mb-1">Categoria → grupo</p>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 text-[13px]">
          {expenseCats.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{c.icon ? `${c.icon} ` : ''}{c.name}</span>
              <select
                className="input !w-auto !py-1 !text-[12px]"
                value={c.group_id ?? ''}
                disabled={pending}
                onChange={(e) => start(async () => { await assignCategoryGroup(c.id, e.target.value ? Number(e.target.value) : null); })}
              >
                <option value="">fora do orçamento</option>
                {groups.filter((g) => g.basis === 'expense').map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function GroupForm({ group, close }: { group: BudgetGroup | null; close: () => void }) {
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveGroup>> | undefined, fd: FormData) => {
    const r = await saveGroup(prev, fd);
    if (r.ok) close();
    return r;
  }, undefined);
  return (
    <form action={action} className="rounded-xl bg-surface-2 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px] items-end">
      {group ? <input type="hidden" name="id" value={group.id} /> : null}
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Nome
        <input name="name" className="input" defaultValue={group?.name ?? ''} placeholder="Necessidades básicas" required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Percentual
        <input name="percent" type="number" min={0} max={100} step={0.5} className="input tabular" defaultValue={group?.percent ?? ''} required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Mede
        <select name="basis" className="input" defaultValue={group?.basis ?? 'expense'}>
          <option value="expense">Gastos das categorias</option>
          <option value="investment">Aportes em investimento</option>
        </select>
      </label>
      {state?.error ? <p className="col-span-full text-bad">{state.error}</p> : null}
      <div className="col-span-full flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Salvando...' : 'Salvar'}</button>
        <button type="button" className="btn btn-ghost" onClick={close}>Cancelar</button>
      </div>
    </form>
  );
}
