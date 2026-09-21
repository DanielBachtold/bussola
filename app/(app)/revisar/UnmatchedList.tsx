'use client';

import { useTransition } from 'react';
import { confirmWithoutStatement, matchCandidates, matchManually, removeTransaction, undoRemove } from '@/app/actions/transactions';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import type { Category, Transaction } from '@/lib/types';

export function UnmatchedList({ items }: { items: Transaction[]; categories: Category[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const [picking, setPicking] = useState<{ id: number; options: { id: number; date: string; amount: number; description: string }[] } | null>(null);
  if (!items.length) return <p className="text-sm text-ink-3 py-4 text-center">Nada por aqui.</p>;
  return (
    <ul className="flex flex-col">
      {items.map((t) => (
        <li key={t.id} className="hairline first:border-t-0 flex flex-wrap items-center gap-3 py-2.5">
          <span className="flex-1 min-w-[160px]">
            <span className="block text-[14px] font-medium">{t.description}</span>
            <span className="block text-[12px] text-ink-3">{formatDate(t.date)} · {t.account_name}{t.category_name ? ` · ${t.category_name}` : ''}</span>
          </span>
          <span className="tabular font-semibold text-[14px]">{formatBRL(Math.abs(t.amount))}</span>
          <span className="flex gap-1 flex-wrap">
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { const options = await matchCandidates(t.id); if (!options.length) toast({ text: 'Nenhuma linha do extrato parecida (mesma conta, ±10 dias, valor próximo).' }); else setPicking({ id: t.id, options }); })}>Era esta linha…</button>
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { const r = await confirmWithoutStatement(t.id); toast(r.error ? { tone: 'bad', text: r.error } : { tone: 'good', text: 'Confirmado.' }); })}>Aconteceu mesmo</button>
            <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => start(async () => { const r = await removeTransaction(t.id); if (r.removed) { const rows = r.removed; toast({ text: 'Lançamento excluído.', action: { label: 'Desfazer', onClick: async () => { await undoRemove(rows); } } }); } else toast({ tone: 'bad', text: r.error ?? 'Erro.' }); })}>Excluir</button>
          </span>
          {picking?.id === t.id ? (
            <ul className="w-full rounded-xl bg-surface-2 p-2 flex flex-col gap-1 text-[13px]">
              <li className="text-ink-3 px-1">Qual linha do extrato é esta?</li>
              {picking.options.map((o) => (
                <li key={o.id}>
                  <button className="w-full text-left flex justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface" disabled={pending} onClick={() => start(async () => { const r = await matchManually(t.id, o.id); toast(r.error ? { tone: 'bad', text: r.error } : { tone: 'good', text: 'Conciliado.' }); setPicking(null); })}>
                    <span className="truncate">{formatDate(o.date).slice(0, 5)} · {o.description}</span>
                    <span className="shrink-0">{formatBRL(Math.abs(o.amount))}</span>
                  </button>
                </li>
              ))}
              <li><button className="btn btn-ghost btn-sm" onClick={() => setPicking(null)}>Cancelar</button></li>
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
