'use client';

import { useTransition } from 'react';
import { confirmWithoutStatement, removeTransaction, undoRemove } from '@/app/actions/transactions';
import { useToast } from '@/components/Toast';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import type { Category, Transaction } from '@/lib/types';

export function UnmatchedList({ items }: { items: Transaction[]; categories: Category[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
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
          <span className="flex gap-1">
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { const r = await confirmWithoutStatement(t.id); toast(r.error ? { tone: 'bad', text: r.error } : { tone: 'good', text: 'Confirmado.' }); })}>Aconteceu mesmo</button>
            <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => start(async () => { const r = await removeTransaction(t.id); if (r.removed) { const rows = r.removed; toast({ text: 'Lançamento excluído.', action: { label: 'Desfazer', onClick: async () => { await undoRemove(rows); } } }); } else toast({ tone: 'bad', text: r.error ?? 'Erro.' }); })}>Excluir</button>
          </span>
        </li>
      ))}
    </ul>
  );
}
