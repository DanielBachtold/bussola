'use client';

import { useState, useTransition } from 'react';
import { formatBRL } from '@/lib/money';
import { formatDateShort, formatMonth } from '@/lib/dates';
import type { Category, Transaction, TxKind } from '@/lib/types';
import { editTransaction, removeTransaction, setCategory, setKind } from '@/app/actions/transactions';

export function TxList({ items, categories, compact = false, emptyText = 'Nenhum lançamento.' }: { items: Transaction[]; categories: Category[]; compact?: boolean; emptyText?: string }) {
  if (!items.length) return <p className="text-sm text-ink-3 py-6 text-center">{emptyText}</p>;
  return (
    <ul className="flex flex-col">
      {items.map((t) => <TxRow key={t.id} tx={t} categories={categories} compact={compact} />)}
    </ul>
  );
}

function TxRow({ tx, categories, compact }: { tx: Transaction; categories: Category[]; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const negative = tx.amount < 0;
  const amountClass = tx.kind === 'transfer' ? 'text-ink-3' : tx.kind === 'income' ? 'text-good' : 'text-ink';
  const status = tx.reviewed === false ? 'revisar' : tx.status === 'pending' ? 'aguardando extrato' : tx.status === 'reconciled' ? 'conciliado' : null;

  return (
    <li className="hairline first:border-t-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-surface-2/60 -mx-2 px-2 rounded-md">
        <span className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center text-[16px] shrink-0" aria-hidden>
          {tx.kind === 'transfer' ? '⇄' : tx.category_icon ?? (tx.kind === 'income' ? '↓' : '·')}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-[14px] font-medium">{tx.description}</span>
          <span className="block truncate text-[12px] text-ink-3">
            {formatDateShort(tx.date)} · {tx.account_name}
            {!compact && tx.category_name ? ` · ${tx.category_name}` : ''}
            {tx.kind === 'transfer' ? ' · transferência' : ''}
            {tx.invoice_month ? ` · fatura ${formatMonth(tx.invoice_month)}` : ''}
          </span>
        </span>
        <span className="flex flex-col items-end shrink-0">
          <span className={`tabular text-[14px] font-semibold ${amountClass}`}>{negative ? '−' : '+'}{formatBRL(Math.abs(tx.amount))}</span>
          {status ? <span className={`pill !text-[10px] ${status === 'revisar' ? 'pill-warn' : status === 'conciliado' ? 'pill-good' : ''}`}>{status}</span> : null}
        </span>
      </button>
      {open ? <TxEditor tx={tx} categories={categories} pending={pending} start={start} close={() => setOpen(false)} /> : null}
    </li>
  );
}

function TxEditor({ tx, categories, pending, start, close }: { tx: Transaction; categories: Category[]; pending: boolean; start: (fn: () => Promise<void> | void) => void; close: () => void }) {
  const [desc, setDesc] = useState(tx.description);
  const [amount, setAmount] = useState(String(Math.abs(tx.amount)).replace('.', ','));
  const [date, setDate] = useState(tx.date);
  const [learn, setLearn] = useState(tx.source === 'import');
  const cats = categories.filter((c) => c.kind === (tx.kind === 'income' ? 'income' : 'expense'));

  return (
    <div className="mb-3 rounded-xl bg-surface-2 p-3 flex flex-col gap-3 text-[13px]">
      {tx.statement_description && tx.statement_description !== tx.description ? (
        <p className="text-ink-3">No extrato: <span className="text-ink-2">{tx.statement_description}</span></p>
      ) : null}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-ink-3">Descrição</span>
          <input className="input !py-1.5" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-3">Valor</span>
          <input className="input !py-1.5 tabular" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-3">Data</span>
          <input className="input !py-1.5" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input !w-auto !py-1.5"
          value={tx.kind}
          disabled={pending}
          onChange={(e) => start(async () => { await setKind(tx.id, e.target.value as TxKind, learn); })}
        >
          <option value="expense">Gasto</option>
          <option value="income">Receita</option>
          <option value="transfer">Transferência</option>
        </select>
        {tx.kind !== 'transfer' ? (
          <select
            className="input !w-auto !py-1.5"
            value={tx.category_id ?? ''}
            disabled={pending}
            onChange={(e) => start(async () => { await setCategory(tx.id, e.target.value ? Number(e.target.value) : null, learn); })}
          >
            <option value="">Sem categoria</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
          </select>
        ) : null}
        {tx.source === 'import' ? (
          <label className="flex items-center gap-1.5 text-ink-2">
            <input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} /> aprender esse padrão
          </label>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => start(async () => { await editTransaction(tx.id, { description: desc, amount, date }); close(); })}
          >
            Salvar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={close}>Fechar</button>
        </div>
        <div className="flex gap-2">
          {tx.installment_group ? (
            <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => { if (confirm('Excluir esta e as parcelas seguintes?')) start(async () => { await removeTransaction(tx.id, true); }); }}>
              Excluir parcelas
            </button>
          ) : null}
          <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => { if (confirm('Excluir este lançamento?')) start(async () => { await removeTransaction(tx.id); }); }}>
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
