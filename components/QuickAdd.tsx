'use client';

import { useMemo, useState, useTransition } from 'react';
import { quickParse } from '@/lib/quickparse';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import type { Account, Category, Rule, Trip } from '@/lib/types';
import { quickAdd } from '@/app/actions/transactions';

export function QuickAdd({ accounts, categories, rules, trips = [] }: { accounts: Account[]; categories: Category[]; rules: Rule[]; trips?: Trip[] }) {
  const [text, setText] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<number | '' | null>(null);
  const [tripChoice, setTripChoice] = useState<boolean | null>(null); // null = padrão
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const parsed = useMemo(() => (text.trim() ? quickParse(text, accounts, categories, rules) : null), [text, accounts, categories, rules]);
  const effectiveAccount = accountId !== '' ? accounts.find((a) => a.id === accountId) ?? null : parsed?.account ?? null;
  const effectiveCategory = categoryId === null ? parsed?.category ?? null : categoryId === '' ? null : categories.find((c) => c.id === categoryId) ?? null;
  const cats = categories.filter((c) => c.kind === (parsed?.kind === 'income' ? 'income' : 'expense'));
  // viagem cobrindo a data do gasto: entra por padrão, a não ser que a categoria seja fixa
  const trip = parsed && parsed.kind === 'expense' ? trips.find((t) => t.start_date <= parsed.date && parsed.date <= t.end_date) ?? null : null;
  const tripDefault = Boolean(trip && !effectiveCategory?.fixed);
  const tripOn = trip ? (tripChoice ?? tripDefault) : false;

  function submit() {
    if (!parsed || !effectiveAccount) return;
    start(async () => {
      const res = await quickAdd(text, {
        accountId: effectiveAccount.id,
        categoryId: categoryId === null ? undefined : categoryId === '' ? null : categoryId,
        tripId: trip ? (tripOn ? trip.id : null) : undefined,
        date: parsed.date,
      });
      if (res.ok) { setMsg({ ok: true, text: res.message ?? 'Registrado.' }); setText(''); setAccountId(''); setCategoryId(null); setTripChoice(null); }
      else setMsg({ ok: false, text: res.error ?? 'Erro.' });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex gap-2">
        <input
          className="input !text-[16px] !py-3"
          placeholder="almoço 42 crédito rico"
          value={text}
          autoFocus
          onChange={(e) => { setText(e.target.value); setMsg(null); setCategoryId(null); setTripChoice(null); }}
          enterKeyHint="done"
        />
        <button className="btn btn-primary !px-5" disabled={!parsed || !effectiveAccount || pending}>{pending ? '...' : 'Lançar'}</button>
      </form>

      {msg ? <p className={`text-sm ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</p> : null}

      {parsed ? (
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[16px] font-semibold truncate">{parsed.description}</span>
            <span className={`tabular text-[18px] font-semibold ${parsed.kind === 'income' ? 'text-good' : parsed.kind === 'transfer' ? 'text-ink-2' : ''}`}>
              {parsed.amount < 0 ? '−' : '+'}{formatBRL(Math.abs(parsed.amount))}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <span className="pill">{parsed.kind === 'expense' ? 'Gasto' : parsed.kind === 'income' ? 'Receita' : 'Transferência'}</span>
            <span className="pill">{formatDate(parsed.date)}</span>
            {parsed.installments > 1 ? <span className="pill pill-warn">{parsed.installments}x de {formatBRL(Math.abs(parsed.amount) / parsed.installments)}</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[12px] text-ink-3">
              Conta
              <select className="input !py-2" value={effectiveAccount?.id ?? ''} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Escolha...</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            {parsed.kind !== 'transfer' ? (
              <label className="flex flex-col gap-1 text-[12px] text-ink-3">
                Categoria
                <select className="input !py-2" value={effectiveCategory?.id ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Sem categoria</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          {trip ? (
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input type="checkbox" checked={tripOn} onChange={(e) => setTripChoice(e.target.checked)} />
              Conta no teto da viagem <span className="font-medium text-ink">{trip.name}</span>
              {effectiveCategory?.fixed ? <span className="text-ink-3">(categoria fixa, fica fora por padrão)</span> : null}
            </label>
          ) : null}
          {parsed.warnings.map((w) => <p key={w} className="text-[13px] text-warn">{w}</p>)}
        </div>
      ) : text.trim() ? (
        <p className="text-sm text-ink-3">Inclua o valor na frase, por exemplo &ldquo;uber 23,50&rdquo;.</p>
      ) : null}
    </div>
  );
}
