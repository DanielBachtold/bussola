'use client';

import { useMemo, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { removeSnapshot, restoreSnapshot, saveSnapshots } from '@/app/actions/investments';
import { formatBRL, parseAmount } from '@/lib/money';
import { addMonths, currentMonth, formatMonth } from '@/lib/dates';
import type { Account, Snapshot } from '@/lib/types';
import { useToast } from '@/components/Toast';

type Row = { key: string; accountId: number; asset: string; assetClass: string; previous: number | null; balance: string; locked: boolean };

/**
 * Posição do mês: os ativos do último mês registrado já vêm listados, só falta o saldo novo.
 * Um salvar só. Depois de salvar, cada linha mostra quanto rendeu (variação menos aporte).
 */
export function SnapshotForm({ accounts, snapshots, contributions }: { accounts: Account[]; snapshots: Snapshot[]; contributions: Record<string, Record<number, number>> }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [month, setMonth] = useState(currentMonth());
  const months = useMemo(() => Array.from({ length: 24 }, (_, i) => addMonths(currentMonth(), -i)), []);

  // último mês com posição antes (ou igual) do escolhido, por conta+ativo
  const prevByKey = useMemo(() => {
    const map = new Map<string, Snapshot>();
    for (const s of snapshots) {
      if (s.month.slice(0, 7) >= month) continue;
      const k = `${s.account_id}|${s.asset.toLowerCase()}`;
      if (!map.has(k) || map.get(k)!.month < s.month) map.set(k, s);
    }
    return map;
  }, [snapshots, month]);
  const currentByKey = useMemo(() => new Map(snapshots.filter((s) => s.month.slice(0, 7) === month).map((s) => [`${s.account_id}|${s.asset.toLowerCase()}`, s])), [snapshots, month]);

  const initialRows = useMemo<Row[]>(() => {
    const keys = new Set([...prevByKey.keys(), ...currentByKey.keys()]);
    const rows: Row[] = [];
    for (const k of keys) {
      const prev = prevByKey.get(k), cur = currentByKey.get(k);
      const src = cur ?? prev!;
      rows.push({ key: k, accountId: src.account_id, asset: src.asset, assetClass: src.asset_class ?? '', previous: prev?.balance ?? null, balance: cur ? String(cur.balance).replace('.', ',') : '', locked: true });
    }
    return rows.sort((a, b) => a.accountId - b.accountId || a.asset.localeCompare(b.asset));
  }, [prevByKey, currentByKey]);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [seenMonth, setSeenMonth] = useState(month);
  if (seenMonth !== month) { setSeenMonth(month); setRows(initialRows); }

  // saldos salvos nesta sessão, por mês: o rendimento só vale pro mês que foi salvo
  const [saved, setSaved] = useState<Record<string, Record<string, number>>>({});
  const update = (key: string, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((list) => [...list, { key: `new-${Date.now()}`, accountId: accounts[0]?.id ?? 0, asset: '', assetClass: '', previous: null, balance: '', locked: false }]);

  function submit() {
    start(async () => {
      const r = await saveSnapshots(month, rows.map((x) => ({ accountId: x.accountId, asset: x.asset, assetClass: x.assetClass, balance: x.balance })));
      if (r.error) { toast({ tone: 'bad', text: r.error }); return; }
      toast({ tone: 'good', text: r.message ?? 'Salvo.' });
      const out: Record<string, number> = {};
      for (const x of rows) if (x.balance.trim()) { try { out[x.key] = parseAmount(x.balance); } catch { /* valor inválido já foi recusado no servidor */ } }
      setSaved((all) => ({ ...all, [month]: out }));
    });
  }

  const contribMonth = contributions[month] ?? {};
  const savedMonth = saved[month] ?? {};
  // rendimento por conta: soma dos saldos novos menos soma dos anteriores menos o aporte da conta
  const accountReturns = accounts.map((a) => {
    const mine = rows.filter((r) => r.accountId === a.id && savedMonth[r.key] !== undefined && r.previous !== null);
    if (!mine.length) return null;
    const value = mine.reduce((acc, r) => acc + savedMonth[r.key], 0) - mine.reduce((acc, r) => acc + (r.previous ?? 0), 0) - (contribMonth[a.id] ?? 0);
    return { account: a, value, partial: mine.length < rows.filter((r) => r.accountId === a.id).length };
  }).filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="flex items-center gap-2">
        <span className="text-ink-3">Posição de</span>
        <select className="input !w-auto !py-1.5" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{formatMonth(m, true)}</option>)}
        </select>
      </div>
      {!rows.length ? <p className="text-ink-3">Nenhum ativo ainda. Adicione o primeiro abaixo.</p> : null}
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => {
          const account = accounts.find((a) => a.id === r.accountId);
          const savedValue = savedMonth[r.key];
          // por linha, só a variação bruta; o aporte é descontado no total da conta (abaixo)
          const delta = savedValue !== undefined && r.previous !== null ? savedValue - r.previous : null;
          return (
            <li key={r.key} className="py-2 grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1fr_1fr] gap-x-3 gap-y-1 items-center">
              {r.locked ? (
                <span className="min-w-0"><span className="font-medium">{r.asset}</span><span className="text-ink-3"> · {account?.name}{r.assetClass ? ` · ${r.assetClass}` : ''}</span></span>
              ) : (
                <span className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                  <input className="input !py-1.5" placeholder="Ativo (Tesouro Selic, CDB, ITSA4...)" value={r.asset} onChange={(e) => update(r.key, { asset: e.target.value })} />
                  <span className="flex gap-1">
                    <select className="input !py-1.5" value={r.accountId} onChange={(e) => update(r.key, { accountId: Number(e.target.value) })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                    <input className="input !py-1.5" list="classes" placeholder="Classe" value={r.assetClass} onChange={(e) => update(r.key, { assetClass: e.target.value })} />
                  </span>
                </span>
              )}
              <span className="text-ink-3 text-right hidden sm:block">{r.previous !== null ? `antes ${formatBRL(r.previous)}` : ''}</span>
              <span className="flex flex-col items-end gap-0.5">
                <input className="input !py-1.5 text-right max-w-[150px]" inputMode="decimal" placeholder={r.previous !== null ? String(r.previous).replace('.', ',') : '0,00'} value={r.balance} onChange={(e) => update(r.key, { balance: e.target.value })} />
                {delta !== null ? <span className={`text-[12px] ${delta >= 0 ? 'text-good' : 'text-bad'}`}>{delta >= 0 ? '+' : ''}{formatBRL(delta)} de variação</span> : r.previous !== null ? <span className="text-[11px] text-ink-3 sm:hidden">antes {formatBRL(r.previous)}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {accountReturns.length ? (
        <ul className="text-[13px] flex flex-col gap-0.5">
          {accountReturns.map((x) => (
            <li key={x.account.id} className={x.value >= 0 ? 'text-good' : 'text-bad'}>
              {x.account.name}: {x.value >= 0 ? '+' : ''}{formatBRL(x.value)} de rendimento no mês{contribMonth[x.account.id] ? ` (já descontando ${formatBRL(contribMonth[x.account.id])} de aporte)` : ''}{x.partial ? ', com parte dos ativos' : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <datalist id="classes">{['Renda fixa', 'Ações', 'FII', 'Exterior', 'Cripto', 'Previdência', 'Caixa'].map((c) => <option key={c} value={c} />)}</datalist>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}><Plus size={14} className="mr-1" />Adicionar ativo</button>
        <button type="button" className="btn btn-primary" disabled={pending || !accounts.length} onClick={submit}>{pending ? 'Salvando...' : `Salvar posição de ${formatMonth(month)}`}</button>
      </div>
    </div>
  );
}

/** Histórico agrupado por mês; o mais recente aberto. */
export function SnapshotHistory({ snapshots }: { snapshots: Snapshot[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  if (!snapshots.length) return <p className="text-sm text-ink-3">Nenhuma posição registrada.</p>;
  const months = new Map<string, Snapshot[]>();
  for (const s of snapshots) { const k = s.month.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k)!.push(s); }
  return (
    <div className="flex flex-col gap-1">
      {[...months.entries()].map(([m, list], i) => (
        <details key={m} open={i === 0} className="group">
          <summary className="cursor-pointer py-2 flex items-center justify-between text-[14px] hairline first:border-t-0">
            <span className="font-medium">{formatMonth(m, true)}</span>
            <span className="text-ink-2">{formatBRL(list.reduce((a, s) => a + s.balance, 0))} <span className="text-ink-3">· {list.length} {list.length === 1 ? 'ativo' : 'ativos'}</span></span>
          </summary>
          <ul className="pb-2 text-[13px]">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-1">
                <span className="flex-1 min-w-0 truncate">{s.asset} <span className="text-ink-3">· {s.account_name}{s.asset_class ? ` · ${s.asset_class}` : ''}</span></span>
                <span>{formatBRL(s.balance)}</span>
                <button className="text-ink-3 hover:text-bad text-[12px]" aria-label="Remover" disabled={pending} onClick={() => start(async () => { const r = await removeSnapshot(s.id); if (r.snapshot) { const snap = r.snapshot; toast({ text: 'Posição removida.', action: { label: 'Desfazer', onClick: async () => { await restoreSnapshot(snap); } } }); } else toast({ tone: 'bad', text: r.error ?? 'Erro.' }); })}>×</button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
