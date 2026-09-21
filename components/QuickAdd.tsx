'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ArrowUp } from 'lucide-react';
import { quickParse, type QuickHistory } from '@/lib/quickparse';
import { formatBRL } from '@/lib/money';
import { formatDate, todayISO } from '@/lib/dates';
import { normalizeText } from '@/lib/rules';
import type { Account, Category, Rule, Trip } from '@/lib/types';
import type { FrequentDescription } from '@/lib/queries';
import { quickAdd, undoRemove, removeTransaction } from '@/app/actions/transactions';
import { useToast } from './Toast';

const EXAMPLES = ['almoço 42 crédito rico', 'mercado 350 em 3x', 'recebi 5000 salário nubank', 'ontem farmácia 89 débito', 'uber 23,50'];

/**
 * A barra de lançar: uma frase, uma prévia que cabe acima do teclado, um toque.
 * O foco fica no campo depois de lançar, pra emendar o próximo.
 */
export function QuickAdd({ accounts, categories, rules, trips = [], frequent = [], initialText = '', autoSubmit = false }: {
  accounts: Account[]; categories: Category[]; rules: Rule[]; trips?: Trip[]; frequent?: FrequentDescription[]; initialText?: string; autoSubmit?: boolean;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  const [accountId, setAccountId] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<number | '' | null>(null);
  const [tripChoice, setTripChoice] = useState<boolean | null>(null);
  const [placeholder, setPlaceholder] = useState(0);
  const [pending, start] = useTransition();
  const autoDone = useRef(false);

  useEffect(() => {
    if (text) return;
    const t = setInterval(() => setPlaceholder((i) => (i + 1) % EXAMPLES.length), 4000);
    return () => clearInterval(t);
  }, [text]);

  const history = useMemo<QuickHistory>(() => new Map(frequent.map((f) => [f.key, { categoryId: f.category_id, accountId: f.account_id }])), [frequent]);
  const parsed = useMemo(() => (text.trim() ? quickParse(text, accounts, categories, rules, history) : null), [text, accounts, categories, rules, history]);
  const effectiveAccount = accountId !== '' ? accounts.find((a) => a.id === accountId) ?? null : parsed?.account ?? null;
  const effectiveCategory = categoryId === null ? parsed?.category ?? null : categoryId === '' ? null : categories.find((c) => c.id === categoryId) ?? null;
  const cats = categories.filter((c) => c.kind === (parsed?.kind === 'income' ? 'income' : 'expense'));
  const trip = parsed && parsed.kind === 'expense' ? trips.find((t) => t.start_date <= parsed.date && parsed.date <= t.end_date) ?? null : null;
  const tripDefault = Boolean(trip && !effectiveCategory?.fixed);
  const tripOn = trip ? (tripChoice ?? tripDefault) : false;
  const ready = Boolean(parsed && effectiveAccount);

  // chips: os gastos que você mais repete; com 2+ letras, filtra pelo começo
  const typed = normalizeText(text);
  const chips = (typed.length >= 2 && !/\d/.test(typed) ? frequent.filter((f) => f.key.startsWith(typed)) : text ? [] : frequent).slice(0, 5);

  function reset() {
    setText(''); setAccountId(''); setCategoryId(null); setTripChoice(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function submit() {
    if (!parsed || !effectiveAccount || pending) return;
    const snapshot = { text, accountId: effectiveAccount.id, categoryId: categoryId === null ? undefined : categoryId === '' ? null : categoryId, tripId: trip ? (tripOn ? trip.id : null) : undefined, date: parsed.date };
    start(async () => {
      const res = await quickAdd(snapshot.text, { accountId: snapshot.accountId, categoryId: snapshot.categoryId, tripId: snapshot.tripId, date: snapshot.date });
      if (res.ok) {
        const ids = res.ids ?? [];
        toast({
          tone: 'good',
          text: res.message ?? 'Registrado.',
          action: ids.length ? { label: 'Desfazer', onClick: async () => { const r = await removeTransaction(ids[0], ids.length > 1); if (r.removed) { const rows = r.removed; toast({ text: 'Desfeito.', action: { label: 'Refazer', onClick: async () => { await undoRemove(rows); } } }); } } } : undefined,
        });
        reset();
      } else {
        toast({ tone: 'bad', text: res.error ?? 'Erro ao registrar.' });
      }
    });
  }

  // veio de um atalho ou do compartilhar: lança sozinho se a frase estiver completa
  useEffect(() => {
    if (autoSubmit && !autoDone.current && ready) { autoDone.current = true; submit(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmit, ready]);

  const status = !text.trim() ? null
    : !parsed ? 'Falta o valor. Ex.: "uber 23,50".'
    : !effectiveAccount ? 'Em qual conta?'
    : `${parsed.kind === 'income' ? 'Receita' : parsed.kind === 'transfer' ? 'Transferência' : 'Gasto'} de ${formatBRL(Math.abs(parsed.amount))}${parsed.installments > 1 ? ` em ${parsed.installments}x` : ''}. Enter pra lançar.`;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="relative">
        <input
          ref={inputRef}
          className="input !py-3.5 !pr-14 !border-border-strong"
          placeholder={EXAMPLES[placeholder]}
          value={text}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          onChange={(e) => { setText(e.target.value); setCategoryId(null); setTripChoice(null); }}
        />
        {ready ? (
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-accent text-accent-ink flex items-center justify-center shadow-sm disabled:opacity-50"
            onMouseDown={(e) => e.preventDefault()}
            disabled={pending}
            aria-label="Lançar"
          >
            <ArrowUp size={20} strokeWidth={2.25} />
          </button>
        ) : null}
      </form>

      {status ? (
        <p className="text-[13px] text-ink-3 -mt-1 flex flex-wrap items-center gap-1.5">
          {status}
          {parsed && !effectiveAccount ? accounts.map((a) => <button key={a.id} type="button" className="pill hover:bg-surface" onClick={() => setAccountId(a.id)}>{a.name}</button>) : null}
        </p>
      ) : null}

      {chips.length ? (
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-0.5">
          {chips.map((f) => (
            <button
              key={f.key}
              type="button"
              className="pill shrink-0 !py-1 !px-2.5 !text-[13px] hover:bg-surface"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setText(`${f.description} `); setCategoryId(null); inputRef.current?.focus(); }}
              title={`${f.n}x nos últimos 90 dias · última vez ${formatBRL(f.amount)}`}
            >
              {f.description}
            </button>
          ))}
        </div>
      ) : null}

      {parsed ? (
        <div className="card p-3 flex flex-col gap-2 border-l-4 border-l-accent">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold truncate">{parsed.description}</span>
            <span className={`text-[17px] font-semibold shrink-0 ${parsed.kind === 'income' ? 'text-good' : parsed.kind === 'transfer' ? 'text-ink-2' : ''}`}>
              {parsed.kind === 'income' ? '+' : ''}{formatBRL(Math.abs(parsed.amount))}
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto -mx-3 px-3 pb-0.5 text-[13px]">
            <span className="pill shrink-0">{parsed.kind === 'expense' ? 'Gasto' : parsed.kind === 'income' ? 'Receita' : parsed.direction === 'out' ? 'Resgate' : 'Aporte'}</span>
            <span className="pill shrink-0">{parsed.date === todayISO() ? 'hoje' : formatDate(parsed.date)}</span>
            {parsed.installments > 1 ? <span className="pill pill-warn shrink-0">{parsed.installments}x de {formatBRL(Math.abs(parsed.amount) / parsed.installments)}</span> : null}
            <select className="pill shrink-0 appearance-none cursor-pointer !pr-5 bg-[length:10px] bg-[right_6px_center] bg-no-repeat" style={{ backgroundImage: CARET }} value={effectiveAccount?.id ?? ''} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')} aria-label="Conta">
              <option value="">Conta…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {parsed.kind !== 'transfer' ? (
              <select className="pill shrink-0 appearance-none cursor-pointer !pr-5 bg-no-repeat bg-[length:10px] bg-[right_6px_center]" style={{ backgroundImage: CARET }} value={effectiveCategory?.id ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')} aria-label="Categoria">
                <option value="">Sem categoria</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
              </select>
            ) : null}
            {trip ? (
              <label className={`pill shrink-0 cursor-pointer ${tripOn ? 'pill-good' : ''}`}>
                <input type="checkbox" className="mr-1" checked={tripOn} onChange={(e) => setTripChoice(e.target.checked)} />✈ {trip.name}
              </label>
            ) : null}
          </div>
          {parsed.warnings.map((w) => <p key={w} className="text-[12px] text-warn">{w}</p>)}
        </div>
      ) : null}
    </div>
  );
}

const CARET = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23898781' stroke-width='2.5'><path d='m6 9 6 6 6-6'/></svg>\")";
