'use client';

import { useState, useTransition } from 'react';
import { ArrowDownLeft, ArrowLeftRight, CircleDashed } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { formatDateShort, formatMonth } from '@/lib/dates';
import type { Category, Transaction, Trip, TxKind } from '@/lib/types';
import { editTransaction, removeTransaction, setCategory, setKind, undoRemove, type ActionState } from '@/app/actions/transactions';
import { setTransactionTrip } from '@/app/actions/trips';
import { useToast } from './Toast';

export type TxListContext = 'invoice' | 'trip';

export function TxList({ items, categories, trips, compact = false, hideStatus = false, context, emptyText = 'Nenhum lançamento.' }: {
  items: Transaction[]; categories: Category[]; trips?: Trip[]; compact?: boolean;
  /** esconde o estado (revisar / sem extrato) quando o título da seção já diz */
  hideStatus?: boolean;
  /** omite o que a tela já mostra: em faturas, a conta e a fatura; em viagens, a viagem */
  context?: TxListContext;
  emptyText?: string;
}) {
  if (!items.length) return <p className="text-sm text-ink-3 py-6 text-center">{emptyText}</p>;
  return (
    <ul className="flex flex-col">
      {items.map((t) => <TxRow key={t.id} tx={t} categories={categories} trips={trips} compact={compact} hideStatus={hideStatus} context={context} />)}
    </ul>
  );
}

function TxRow({ tx, categories, trips, compact, hideStatus, context }: { tx: Transaction; categories: Category[]; trips?: Trip[]; compact: boolean; hideStatus: boolean; context?: TxListContext }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const amountClass = tx.kind === 'transfer' ? 'text-ink-3' : tx.kind === 'income' ? 'text-good' : 'text-ink';
  // conciliado é o estado normal de quase tudo: não pede ação, não ganha selo
  const status = hideStatus ? null : tx.reviewed === false ? 'revisar' : tx.status === 'pending' && tx.source !== 'import' ? 'sem extrato' : null;
  const noCategory = tx.kind === 'expense' && !tx.category_id;
  const meta = [
    formatDateShort(tx.date),
    tx.kind === 'transfer' ? 'transferência' : tx.category_name,
    context === 'invoice' ? null : tx.account_name,
    context === 'invoice' || !tx.invoice_month ? null : `fatura ${formatMonth(tx.invoice_month)}`,
    context === 'trip' || !tx.trip_name ? null : `✈ ${tx.trip_name}${tx.trip_excluded ? ' (fora do teto)' : ''}`,
    context === 'trip' && tx.trip_excluded ? 'fora do teto' : null,
  ].filter(Boolean);

  return (
    <li className="hairline first:border-t-0 min-w-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-surface-2/60 -mx-2 px-2 rounded-md">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-[16px] shrink-0 ${noCategory ? 'bg-warn-bg text-warn' : tx.kind === 'income' ? 'bg-good-bg text-good' : 'bg-surface-2 text-ink-3'}`} aria-hidden title={noCategory ? 'sem categoria' : undefined}>
          {tx.kind === 'transfer' ? <ArrowLeftRight size={16} /> : tx.kind === 'income' ? <ArrowDownLeft size={16} /> : noCategory ? <CircleDashed size={16} /> : tx.category_icon ?? <CircleDashed size={16} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-[14px] font-medium">{tx.description}</span>
          <span className="block truncate text-[12px] text-ink-3">{meta.join(' · ')}</span>
        </span>
        <span className="flex flex-col items-end shrink-0">
          <span className={`text-[14px] font-semibold ${amountClass}`}>{tx.kind === 'income' ? '+' : ''}{formatBRL(Math.abs(tx.amount))}</span>
          {status ? <span className={`pill !text-[11px] ${status === 'revisar' ? 'pill-warn' : ''}`}>{status}</span> : null}
        </span>
      </button>
      {open ? <TxEditor tx={tx} categories={categories} trips={trips} pending={pending} start={start} close={() => setOpen(false)} /> : null}
    </li>
  );
}

function TxEditor({ tx, categories, trips, pending, start, close }: { tx: Transaction; categories: Category[]; trips?: Trip[]; pending: boolean; start: (fn: () => Promise<void> | void) => void; close: () => void }) {
  const toast = useToast();
  // toda ação passa por aqui: erro vira aviso em vez de sumir, e o editor só fecha quando deu certo
  const run = async (p: Promise<ActionState>, okText?: string, closeAfter = false) => {
    const r = await p;
    if (r.error) toast({ tone: 'bad', text: r.error });
    else { if (okText) toast({ tone: 'good', text: okText }); if (closeAfter) close(); }
    return r;
  };
  const remove = (wholeGroup: boolean) => start(async () => {
    const r = await removeTransaction(tx.id, wholeGroup);
    if (r.error || !r.removed) { toast({ tone: 'bad', text: r.error ?? 'Não foi possível excluir.' }); return; }
    const rows = r.removed;
    toast({ text: rows.length === 1 ? 'Lançamento excluído.' : `${rows.length} parcelas excluídas.`, action: { label: 'Desfazer', onClick: async () => { await undoRemove(rows); } } });
    close();
  });
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
          onChange={(e) => start(async () => { await run(setKind(tx.id, e.target.value as TxKind, learn)); })}
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
            onChange={(e) => start(async () => { const r = await run(setCategory(tx.id, e.target.value ? Number(e.target.value) : null, learn)); if (r.applied) toast({ tone: 'good', text: `Categorizado, e mais ${r.applied} ${r.applied === 1 ? 'igual' : 'iguais'}.` }); })}
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
      {trips?.length && tx.kind === 'expense' ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-3">Viagem</span>
          <select className="input !w-auto !py-1.5" value={tx.trip_id ?? ''} disabled={pending} onChange={(e) => start(async () => { await run(setTransactionTrip(tx.id, e.target.value ? Number(e.target.value) : null, tx.trip_excluded)); })}>
            <option value="">Nenhuma</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {tx.trip_id ? (
            <label className="flex items-center gap-1.5 text-ink-2">
              <input type="checkbox" checked={tx.trip_excluded} disabled={pending} onChange={(e) => start(async () => { await run(setTransactionTrip(tx.id, tx.trip_id, e.target.checked)); })} /> fora do teto (pré-pago)
            </label>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            onClick={() => start(async () => { await run(editTransaction(tx.id, { description: desc, amount, date }), 'Salvo.', true); })}
          >
            Salvar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={close}>Fechar</button>
        </div>
        <div className="flex gap-2">
          {tx.installment_group ? (
            <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => remove(true)}>
              Excluir parcelas
            </button>
          ) : null}
          <button className="btn btn-ghost btn-sm text-bad" disabled={pending} onClick={() => remove(false)}>
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
