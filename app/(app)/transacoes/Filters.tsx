'use client';

import { useRouter } from 'next/navigation';
import type { Account, Category } from '@/lib/types';

export function Filters({ accounts, categories, month, values }: { accounts: Account[]; categories: Category[]; month: string; values: { a?: number; c?: number; k?: string; q?: string } }) {
  const router = useRouter();
  function apply(form: HTMLFormElement) {
    const fd = new FormData(form);
    const p = new URLSearchParams({ m: month });
    for (const k of ['a', 'c', 'k', 'q']) { const v = String(fd.get(k) ?? '').trim(); if (v) p.set(k, v); }
    router.push(`/transacoes?${p.toString()}`);
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); apply(e.currentTarget); }} onChange={(e) => { if ((e.target as HTMLElement).tagName === 'SELECT') apply(e.currentTarget); }} className="flex flex-wrap gap-2">
      <input name="q" defaultValue={values.q ?? ''} placeholder="buscar..." className="input !w-auto flex-1 min-w-[140px] !py-2" />
      <select name="a" defaultValue={values.a ?? ''} className="input !w-auto !py-2">
        <option value="">Todas as contas</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select name="c" defaultValue={values.c ?? ''} className="input !w-auto !py-2">
        <option value="">Todas as categorias</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
      </select>
      <select name="k" defaultValue={values.k ?? ''} className="input !w-auto !py-2">
        <option value="">Tudo</option>
        <option value="expense">Gastos</option>
        <option value="income">Receitas</option>
        <option value="transfer">Transferências</option>
      </select>
      <button className="btn btn-ghost btn-sm">Filtrar</button>
    </form>
  );
}
