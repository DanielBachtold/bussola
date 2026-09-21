'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import type { Account, Category, Trip } from '@/lib/types';

type Values = { a?: number; c?: number | 'none'; k?: string; s?: string; v?: number; q?: string };

/** Busca sempre à vista; os selects ficam atrás de "Filtros" no celular e aplicam ao mudar. */
export function Filters({ accounts, categories, trips, month, values }: { accounts: Account[]; categories: Category[]; trips: Trip[]; month: string; values: Values }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const active = ['a', 'c', 'k', 's', 'v'].filter((k) => values[k as keyof Values]).length;
  const [open, setOpen] = useState(active > 0);
  const [q, setQ] = useState(values.q ?? '');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(overrides: Partial<Record<string, string>> = {}) {
    const fd = new FormData(formRef.current!);
    const p = new URLSearchParams({ m: month });
    for (const k of ['a', 'c', 'k', 's', 'v', 'q']) {
      const v = overrides[k] !== undefined ? overrides[k] : String(fd.get(k) ?? '').trim();
      if (v) p.set(k, v);
    }
    router.replace(`/transacoes?${p.toString()}`);
  }

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); apply({ q }); }} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          name="q"
          type="search"
          enterKeyHint="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (debounce.current) clearTimeout(debounce.current);
            debounce.current = setTimeout(() => apply({ q: e.target.value }), 450);
          }}
          placeholder="Buscar por descrição ou valor (todo o histórico)"
          className="input flex-1 !py-2"
        />
        <button type="button" className={`btn btn-ghost !px-3 ${active ? 'text-ink' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <SlidersHorizontal size={16} />{active ? <span className="pill !px-1.5 !py-0 ml-1">{active}</span> : null}
        </button>
        {active || values.q ? (
          <button type="button" className="btn btn-ghost !px-3" onClick={() => router.replace(`/transacoes?m=${month}`)} aria-label="Limpar filtros" title="Limpar filtros"><X size={16} /></button>
        ) : null}
      </div>
      <div className={`${open ? 'flex' : 'hidden'} flex-wrap gap-2`} onChange={() => apply()}>
        <select name="a" defaultValue={values.a ?? ''} className="input !w-auto !py-2 flex-1 min-w-[140px]">
          <option value="">Todas as contas</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select name="c" defaultValue={values.c ?? ''} className="input !w-auto !py-2 flex-1 min-w-[140px]">
          <option value="">Todas as categorias</option>
          <option value="none">Sem categoria</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
        </select>
        <select name="k" defaultValue={values.k ?? ''} className="input !w-auto !py-2 flex-1 min-w-[120px]">
          <option value="">Tudo</option>
          <option value="expense">Gastos</option>
          <option value="income">Receitas</option>
          <option value="transfer">Transferências</option>
        </select>
        <select name="s" defaultValue={values.s ?? ''} className="input !w-auto !py-2 flex-1 min-w-[140px]">
          <option value="">Qualquer situação</option>
          <option value="revisar">Falta categorizar</option>
          <option value="sem-extrato">Ainda sem extrato</option>
          <option value="conciliado">Conciliado</option>
        </select>
        {trips.length ? (
          <select name="v" defaultValue={values.v ?? ''} className="input !w-auto !py-2 flex-1 min-w-[140px]">
            <option value="">Qualquer viagem</option>
            {trips.map((t) => <option key={t.id} value={t.id}>✈ {t.name}</option>)}
          </select>
        ) : null}
      </div>
    </form>
  );
}
