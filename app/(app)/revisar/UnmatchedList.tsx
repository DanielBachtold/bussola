'use client';

import { useTransition } from 'react';
import { confirmWithoutStatement, removeTransaction } from '@/app/actions/transactions';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import type { Category, Transaction } from '@/lib/types';

export function UnmatchedList({ items }: { items: Transaction[]; categories: Category[] }) {
  const [pending, start] = useTransition();
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
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await confirmWithoutStatement(t.id); })}>Aconteceu mesmo</button>
            <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => { if (confirm('Excluir?')) start(async () => { await removeTransaction(t.id); }); }}>Excluir</button>
          </span>
        </li>
      ))}
    </ul>
  );
}
