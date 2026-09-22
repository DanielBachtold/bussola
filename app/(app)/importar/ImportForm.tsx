'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import { confirmImport, previewParsed, previewUpload, type PreviewState } from '@/app/actions/import';
import { Paperclip } from 'lucide-react';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import type { Account } from '@/lib/types';
import { useToast } from '@/components/Toast';

export function ImportForm({ accounts, defaultAccountId }: { accounts: Account[]; defaultAccountId?: number }) {
  const toast = useToast();
  const [uploaded, action, pending] = useActionState(previewUpload, undefined);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);
  const [pasting, setPasting] = useState(false);
  // prévia atual: a do upload, ou a refeita ao trocar conta/sinal sem reenviar o arquivo
  const [redone, setRedone] = useState<PreviewState | null>(null);
  const [result, setResult] = useState<{ matched: number; inserted: number; skipped: number; accountId: number; periodEnd: string | null; forPreview: unknown } | null>(null);
  const [busy, start] = useTransition();
  const [accountId, setAccountId] = useState(String(defaultAccountId ?? accounts[0]?.id ?? ''));

  const s: PreviewState | undefined = redone ?? uploaded;
  const shownResult = result && s?.preview && result.forPreview === s.preview ? result : null;
  const previewAccount = s?.preview ? accounts.find((a) => a.id === s.preview!.accountId) : undefined;

  const redo = (nextAccountId: number, invert: boolean) => start(async () => {
    if (!s?.statement || !s.filename) return;
    const r = await previewParsed(nextAccountId, s.statement, s.filename, invert);
    if (r.error) toast({ tone: 'bad', text: r.error }); else setRedone(r);
  });

  return (
    <div className="flex flex-col gap-4">
      <form action={(fd) => { setRedone(null); setResult(null); setPicked(null); action(fd); }} className="card p-4 md:p-5 flex flex-col gap-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] text-ink-3">
            Conta
            <select name="account_id" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          {!pasting ? (
            <div className="flex flex-col gap-1.5 text-[13px] text-ink-3">
              Arquivo do banco
              {/* seletor próprio: o nativo mostra "Choose File" em inglês e não cabe no celular */}
              <label className="input flex items-center gap-2 cursor-pointer !py-2.5">
                <span className="btn btn-ghost btn-sm shrink-0"><Paperclip size={14} className="mr-1" />Escolher</span>
                <span className={`truncate ${picked ? 'text-ink' : 'text-ink-3'}`}>{picked ? `${picked.name} · ${(picked.size / 1024).toFixed(0)} KB` : 'OFX, CSV ou PDF'}</span>
                {/* sem accept: o iPhone esconde .ofx quando a gente restringe */}
                <input name="file" type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; setPicked(f ? { name: f.name, size: f.size } : null); }} />
              </label>
            </div>
          ) : null}
          {pasting ? (
            <label className="flex flex-col gap-1.5 text-[13px] text-ink-3 sm:col-span-2">
              Conteúdo do OFX ou CSV
              <textarea name="pasted" rows={6} className="input font-mono !text-[12px]" placeholder="Abra o arquivo, selecione tudo, copie e cole aqui." />
            </label>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
          <label className="flex items-center gap-2 text-ink-2">
            <input type="checkbox" name="invert" defaultChecked={false} />
            Inverter sinais
            <span className="text-ink-3 hidden sm:inline">(compras como valor positivo)</span>
          </label>
          <button type="button" className="text-accent" onClick={() => setPasting((v) => !v)}>
            {pasting ? 'Enviar arquivo' : 'Colar o texto'}
          </button>
          <button className="btn btn-primary ml-auto w-full sm:w-auto" disabled={pending}>{pending ? 'Lendo...' : 'Pré-visualizar'}</button>
        </div>
      </form>

      {s?.error ? <p className="text-sm text-bad">{s.error}</p> : null}

      {shownResult ? (
        <div className="card p-4 border-l-4 border-l-good flex flex-col gap-2">
          <p className="font-semibold">Importação concluída</p>
          <p className="text-[13px] text-ink-2">{shownResult.matched} conciliados com o que você já tinha lançado, {shownResult.inserted} novos, {shownResult.skipped} já existiam.</p>
          <div className="flex flex-wrap gap-2">
            {shownResult.inserted ? <Link href="/revisar" className="btn btn-primary btn-sm">Revisar os {shownResult.inserted} novos</Link> : null}
            <Link href={`/transacoes?m=${shownResult.periodEnd?.slice(0, 7) ?? ''}&a=${shownResult.accountId}`} className="btn btn-ghost btn-sm">Ver lançamentos</Link>
          </div>
        </div>
      ) : null}

      {s?.preview && !shownResult ? (
        <div className="card p-4 md:p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">{s.filename}</p>
              <p className="text-[13px] text-ink-3">
                {previewAccount?.name}
                {s.statement?.periodStart ? ` · ${formatDate(s.statement.periodStart)} a ${formatDate(s.statement.periodEnd ?? s.statement.periodStart)}` : ''}
                {s.statement?.balance != null ? ` · saldo ${formatBRL(s.statement.balance)}` : ''}
              </p>
            </div>
            <div className="flex gap-4 text-right">
              {[
                ['vão entrar', s.preview.counts.new, 'text-ink'],
                ['conciliam', s.preview.counts.match, 'text-good'],
                ['repetidas', s.preview.counts.duplicate, 'text-ink-3'],
              ].map(([label, n, tone]) => (
                <div key={label as string}>
                  <p className={`text-[20px] font-semibold leading-tight ${tone}`}>{n as number}</p>
                  <p className="text-[11px] text-ink-3">{label as string}</p>
                </div>
              ))}
            </div>
          </div>

          {s.statement?.format === 'pdf' ? (
            <p className="text-[13px] text-ink-2">Lido de PDF, então confira as linhas antes de confirmar.</p>
          ) : null}
          {s.acctMatch ? (
            <p className="text-[13px] text-warn flex flex-wrap items-center gap-2">
              Pelo número da conta, este arquivo é de <strong>{s.acctMatch.name}</strong>.
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setAccountId(String(s.acctMatch!.id)); redo(s.acctMatch!.id, Boolean(s.invertSigns)); }}>Usar {s.acctMatch.name}</button>
            </p>
          ) : null}
          {s.statement?.accountKind !== 'unknown' && previewAccount && s.statement?.accountKind !== previewAccount.kind && previewAccount.kind !== 'investment' ? (
            <p className="text-[13px] text-warn">O arquivo parece ser de {s.statement?.accountKind === 'credit_card' ? 'cartão de crédito' : 'conta corrente'}, mas a conta escolhida é {previewAccount.kind === 'credit_card' ? 'cartão' : 'conta corrente'}.</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-2">
            <label className="flex items-center gap-1.5">
              Conta
              <select className="input !w-auto !py-1" value={s.preview.accountId} disabled={busy} onChange={(e) => redo(Number(e.target.value), Boolean(s.invertSigns))}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={Boolean(s.invertSigns)} disabled={busy} onChange={(e) => redo(s.preview!.accountId, e.target.checked)} /> inverter sinais
            </label>
          </div>

          {/* celular: uma linha por lançamento, como no resto do app */}
          <ul className="md:hidden flex flex-col divide-y divide-border max-h-[50vh] overflow-y-auto -mx-1 px-1">
            {s.preview.lines.map((l, i) => (
              <li key={i} className={`py-2 flex items-center gap-3 ${l.outcome === 'duplicate' ? 'opacity-50' : ''}`}>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] truncate">{l.description}</span>
                  <span className="block text-[12px] text-ink-3">
                    {formatDate(l.date).slice(0, 5)} · {l.outcome === 'match' ? `casa com ${l.matchDescription}` : l.outcome === 'duplicate' ? 'já importada' : l.kind === 'transfer' ? 'transferência' : l.categoryName ?? 'sem categoria'}
                  </span>
                </span>
                <span className={`text-[14px] font-semibold shrink-0 ${l.amount > 0 ? 'text-good' : ''}`}>{formatBRL(l.amount)}</span>
              </li>
            ))}
          </ul>

          <div className="hidden md:block max-h-[420px] overflow-auto">
            <table className="w-full text-[13px]">
              <thead className="text-ink-3 text-left sticky top-0 bg-surface">
                <tr><th className="py-1.5 font-medium">Data</th><th className="py-1.5 font-medium">Descrição</th><th className="py-1.5 font-medium text-right">Valor</th><th className="py-1.5 font-medium pl-3">Resultado</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.preview.lines.map((l, i) => (
                  <tr key={i} className={l.outcome === 'duplicate' ? 'text-ink-3' : ''}>
                    <td className="py-1.5 whitespace-nowrap">{formatDate(l.date).slice(0, 5)}</td>
                    <td className="py-1.5 pr-3 max-w-[320px] truncate" title={l.description}>{l.description}</td>
                    <td className={`py-1.5 text-right whitespace-nowrap ${l.amount > 0 ? 'text-good' : ''}`}>{formatBRL(l.amount)}</td>
                    <td className="py-1.5 pl-3 whitespace-nowrap">
                      {l.outcome === 'match' ? <span className="pill pill-good">= {l.matchDescription}</span>
                        : l.outcome === 'duplicate' ? <span className="pill">já importada</span>
                        : <span className="pill">{l.kind === 'transfer' ? 'transferência' : l.categoryName ?? 'sem categoria'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="btn btn-primary w-full md:w-auto md:self-end"
            disabled={busy || (s.preview.counts.match + s.preview.counts.new === 0)}
            onClick={() => start(async () => {
              const r = await confirmImport(s.preview!.accountId, s.filename!, s.statement!, Boolean(s.invertSigns));
              if (r.ok) setResult({ matched: r.matched, inserted: r.inserted, skipped: r.skipped, accountId: s.preview!.accountId, periodEnd: s.statement?.periodEnd ?? null, forPreview: s.preview });
              else toast({ tone: 'bad', text: r.error });
            })}
          >
            {busy ? 'Importando...' : `Confirmar ${s.preview.counts.match + s.preview.counts.new} ${s.preview.counts.match + s.preview.counts.new === 1 ? 'lançamento' : 'lançamentos'}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
