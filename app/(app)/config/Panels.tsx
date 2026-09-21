'use client';

import { useActionState, useState, useTransition } from 'react';
import { archiveAccount, deleteCategory, deleteRule, restoreRule, saveAccount, saveCategory, saveRule } from '@/app/actions/config';
import { useToast } from '@/components/Toast';
import { formatBRL } from '@/lib/money';
import { KIND_LABEL, type Account, type BudgetGroup, type Category, type Rule } from '@/lib/types';

export function AccountsPanel({ accounts }: { accounts: Account[] }) {
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Contas e cartões</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>Nova conta</button>
      </div>
      <ul className="divide-y divide-border text-[14px]">
        {accounts.map((a) => (
          <li key={a.id} className={`py-2.5 flex flex-wrap items-center gap-3 ${a.archived ? 'opacity-50' : ''}`}>
            <span className="flex-1 min-w-[160px]">
              <span className="font-medium">{a.name}</span>
              <span className="block text-[12px] text-ink-3">
                {KIND_LABEL[a.kind]}{a.institution ? ` · ${a.institution}` : ''}
                {a.kind === 'credit_card' ? ` · fecha dia ${a.closing_day}, vence dia ${a.due_day}${a.credit_limit ? ` · limite ${formatBRL(a.credit_limit)}` : ''}` : ''}
                {a.balance != null ? ` · saldo ${formatBRL(a.balance)}` : ''}
              </span>
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(a)}>Editar</button>
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await archiveAccount(a.id, !a.archived); })}>{a.archived ? 'Reativar' : 'Arquivar'}</button>
          </li>
        ))}
        {!accounts.length ? <li className="py-3 text-ink-3 text-sm">Nenhuma conta. Crie sua conta corrente, seus cartões e suas corretoras.</li> : null}
      </ul>
      {editing ? <AccountForm key={editing === 'new' ? 'new' : editing.id} account={editing === 'new' ? null : editing} close={() => setEditing(null)} /> : null}
    </section>
  );
}

function AccountForm({ account, close }: { account: Account | null; close: () => void }) {
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveAccount>> | undefined, fd: FormData) => {
    const r = await saveAccount(prev, fd);
    if (r.ok) close();
    return r;
  }, undefined);
  const [kind, setKind] = useState(account?.kind ?? 'checking');
  return (
    <form action={action} className="rounded-xl bg-surface-2 p-4 grid grid-cols-2 gap-3 text-[13px]">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <label className="flex flex-col gap-1 text-ink-3">Nome
        <input name="name" className="input" defaultValue={account?.name ?? ''} placeholder="Nubank, Rico, BTG..." required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Tipo
        <select name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as Account['kind'])}>
          <option value="checking">Conta corrente</option>
          <option value="credit_card">Cartão de crédito</option>
          <option value="investment">Investimentos</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Instituição (opcional, ajuda a barra rápida a reconhecer)
        <input name="institution" className="input" defaultValue={account?.institution ?? ''} />
      </label>
      {kind === 'credit_card' ? (
        <>
          <label className="flex flex-col gap-1 text-ink-3">Dia de fechamento
            <input name="closing_day" type="number" min={1} max={31} className="input" defaultValue={account?.closing_day ?? ''} required />
          </label>
          <label className="flex flex-col gap-1 text-ink-3">Dia de vencimento
            <input name="due_day" type="number" min={1} max={31} className="input" defaultValue={account?.due_day ?? ''} required />
          </label>
          <label className="flex flex-col gap-1 text-ink-3 col-span-2">Limite (opcional)
            <input name="credit_limit" className="input tabular" inputMode="decimal" defaultValue={account?.credit_limit ?? ''} />
          </label>
        </>
      ) : null}
      {state?.error ? <p className="col-span-2 text-bad">{state.error}</p> : null}
      <div className="col-span-2 flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Salvando...' : 'Salvar'}</button>
        <button type="button" className="btn btn-ghost" onClick={close}>Cancelar</button>
      </div>
    </form>
  );
}

export function CategoriesPanel({ categories, groups = [] }: { categories: Category[]; groups?: BudgetGroup[] }) {
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [pending, start] = useTransition();
  const kinds: Array<['expense' | 'income', string]> = [['expense', 'Gastos'], ['income', 'Receitas']];
  return (
    <section className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Categorias</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>Nova categoria</button>
      </div>
      {kinds.map(([k, label]) => (
        <div key={k}>
          <p className="text-[12px] uppercase tracking-wide text-ink-3 font-medium mb-1">{label}</p>
          <ul className="flex flex-wrap gap-2">
            {categories.filter((c) => c.kind === k).map((c) => (
              <li key={c.id} className="pill !py-1 !px-2.5 !text-[13px] gap-2">
                <button onClick={() => setEditing(c)}>{c.icon ? `${c.icon} ` : ''}{c.name}{c.fixed ? <span className="text-ink-3" title="conta fixa"> · fixa</span> : null}{c.budget ? <span className="text-ink-3"> · {formatBRL(c.budget)}</span> : null}</button>
                <button className="text-ink-3 hover:text-bad" disabled={pending} aria-label="Excluir" onClick={() => { if (confirm(`Excluir "${c.name}"? Os lançamentos ficam sem categoria.`)) start(async () => { await deleteCategory(c.id); }); }}>×</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {editing ? <CategoryForm key={editing === 'new' ? 'new' : editing.id} category={editing === 'new' ? null : editing} groups={groups} close={() => setEditing(null)} /> : null}
    </section>
  );
}

function CategoryForm({ category, groups, close }: { category: Category | null; groups: BudgetGroup[]; close: () => void }) {
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof saveCategory>> | undefined, fd: FormData) => {
    const r = await saveCategory(prev, fd);
    if (r.ok) close();
    return r;
  }, undefined);
  return (
    <form action={action} className="rounded-xl bg-surface-2 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-[13px]">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Nome
        <input name="name" className="input" defaultValue={category?.name ?? ''} required />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Ícone (emoji)
        <input name="icon" className="input" defaultValue={category?.icon ?? ''} maxLength={4} />
      </label>
      <label className="flex flex-col gap-1 text-ink-3">Tipo
        <select name="kind" className="input" defaultValue={category?.kind ?? 'expense'}>
          <option value="expense">Gasto</option>
          <option value="income">Receita</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-ink-3 col-span-2">Orçamento mensal (opcional)
        <input name="budget" className="input" inputMode="decimal" defaultValue={category?.budget ?? ''} placeholder="ex.: 800" />
      </label>
      {groups.length ? (
        <label className="flex flex-col gap-1 text-ink-3 col-span-2">Grupo do orçamento
          <select name="group_id" className="input" defaultValue={category?.group_id ?? ''}>
            <option value="">Fora do orçamento por percentual</option>
            {groups.filter((g) => g.basis === 'expense').map((g) => <option key={g.id} value={g.id}>{g.name} · {g.percent}%</option>)}
          </select>
        </label>
      ) : null}
      <label className="flex items-center gap-2 text-ink-2 col-span-2">
        <input type="checkbox" name="fixed" defaultChecked={category?.fixed ?? false} />
        Conta fixa: continua vindo mesmo em viagem (financiamento, faculdade, aluguel). Não entra no teto de viagens.
      </label>
      {state?.error ? <p className="col-span-2 md:col-span-4 text-bad">{state.error}</p> : null}
      <div className="col-span-2 md:col-span-4 flex gap-2">
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Salvando...' : 'Salvar'}</button>
        <button type="button" className="btn btn-ghost" onClick={close}>Cancelar</button>
      </div>
    </form>
  );
}

export function RulesPanel({ rules, categories }: { rules: Rule[]; categories: Category[] }) {
  const [state, action, pending] = useActionState(saveRule, undefined);
  const [deleting, start] = useTransition();
  const toast = useToast();
  return (
    <section className="card p-4 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Regras de categorização</h2>
        <p className="text-[13px] text-ink-2">Se a descrição do extrato contém o padrão, o lançamento recebe a categoria (ou vira transferência). O sistema cria regras sozinho quando você categoriza com &ldquo;aprender esse padrão&rdquo;.</p>
      </div>
      <form action={action} className="flex flex-wrap gap-2 items-end text-[13px]">
        <label className="flex flex-col gap-1 text-ink-3 flex-1 min-w-[160px]">Padrão
          <input name="pattern" className="input" placeholder="ex.: uber, ifood, netflix" required />
        </label>
        <label className="flex flex-col gap-1 text-ink-3">Vira
          <select name="target" className="input" defaultValue="">
            <option value="" disabled>Escolha...</option>
            <option value="transfer">Transferência (não é gasto)</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" disabled={pending}>Criar regra</button>
        {state?.error ? <p className="w-full text-bad">{state.error}</p> : null}
      </form>
      <ul className="divide-y divide-border text-[13px]">
        {rules.map((r) => (
          <li key={r.id} className="py-2 flex items-center gap-3">
            <code className="font-mono text-[12px] bg-surface-2 rounded px-1.5 py-0.5">{r.pattern}</code>
            <span className="text-ink-3">→</span>
            <span className="flex-1">{r.kind === 'transfer' ? 'Transferência' : r.category_name ?? 'sem categoria'}</span>
            <button className="text-ink-3 hover:text-bad text-[12px]" disabled={deleting} onClick={() => start(async () => { const res = await deleteRule(r.id); if (res.rule) { const rule = res.rule; toast({ text: `Regra "${rule.pattern}" removida.`, action: { label: 'Desfazer', onClick: async () => { await restoreRule(rule); } } }); } else toast({ tone: 'bad', text: res.error ?? 'Erro.' }); })}>remover</button>
          </li>
        ))}
        {!rules.length ? <li className="py-2 text-ink-3">Nenhuma regra ainda.</li> : null}
      </ul>
    </section>
  );
}
