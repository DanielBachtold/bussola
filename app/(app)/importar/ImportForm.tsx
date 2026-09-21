'use client';

import { useActionState, useState, useTransition } from 'react';
import { confirmImport, previewUpload, type PreviewState } from '@/app/actions/import';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import type { Account } from '@/lib/types';

export function ImportForm({ accounts }: { accounts: Account[] }) {
  const [state, action, pending] = useActionState(previewUpload, undefined);
  // o resultado só vale pra prévia que o gerou: uma nova prévia volta a mostrar a tabela
  const [result, setResult] = useState<{ matched: number; inserted: number; skipped: number; forPreview: unknown } | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committing, start] = useTransition();
  const [accountId, setAccountId] = useState(String(accounts[0]?.id ?? ''));

  const s: PreviewState | undefined = state;
  const shownResult = result && s?.preview && result.forPreview === s.preview ? result : null;
  const previewAccount = s?.preview ? accounts.find((a) => a.id === s.preview!.accountId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="card p-4 grid md:grid-cols-[1fr_auto] gap-3 items-end">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[13px] text-ink-3">
            Conta
            <select name="account_id" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-3">
            Arquivo (.ofx ou .csv)
            <input name="file" type="file" accept=".ofx,.qfx,.csv,.txt" className="input !py-2" required />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-2">
            <input type="checkbox" name="invert" defaultChecked={false} />
            Inverter sinais (use se o arquivo mostra compras como valor positivo, comum em CSV de cartão)
          </label>
        </div>
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Lendo...' : 'Pré-visualizar'}</button>
      </form>

      {s?.error ? <p className="text-sm text-bad">{s.error}</p> : null}

      {shownResult ? (
        <div className="card p-4 border-l-4 border-l-good">
          <p className="font-semibold">Importação concluída</p>
          <p className="text-[13px] text-ink-2">{shownResult.matched} lançamentos conciliados com o que você já tinha registrado, {shownResult.inserted} novos (veja em Revisar), {shownResult.skipped} já existiam.</p>
        </div>
      ) : null}

      {s?.preview && !shownResult ? (
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{s.filename} · {previewAccount?.name}</p>
              <p className="text-[13px] text-ink-2">
                {s.statement?.periodStart ? `${formatDate(s.statement.periodStart)} a ${formatDate(s.statement.periodEnd ?? s.statement.periodStart)} · ` : ''}
                {s.preview.lines.length} linhas
                {s.statement?.balance != null ? ` · saldo ${formatBRL(s.statement.balance)}` : ''}
              </p>
            </div>
            <div className="flex gap-2 text-[12px]">
              <span className="pill pill-good">{s.preview.counts.match} conciliam</span>
              <span className="pill pill-warn">{s.preview.counts.new} novas</span>
              <span className="pill">{s.preview.counts.duplicate} repetidas</span>
            </div>
          </div>
          {s.statement?.accountKind !== 'unknown' && previewAccount && s.statement?.accountKind !== previewAccount.kind && previewAccount.kind !== 'investment' ? (
            <p className="text-[13px] text-warn">O arquivo parece ser de {s.statement?.accountKind === 'credit_card' ? 'cartão de crédito' : 'conta corrente'}, mas a conta escolhida é {previewAccount.kind === 'credit_card' ? 'cartão' : 'conta corrente'}. Confira antes de confirmar.</p>
          ) : null}
          <div className="max-h-[420px] overflow-auto -mx-4 px-4">
            <table className="w-full text-[13px]">
              <thead className="text-ink-3 text-left sticky top-0 bg-surface">
                <tr><th className="py-1 font-medium">Data</th><th className="py-1 font-medium">Descrição</th><th className="py-1 font-medium text-right">Valor</th><th className="py-1 font-medium">Resultado</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.preview.lines.map((l, i) => (
                  <tr key={i} className={l.outcome === 'duplicate' ? 'text-ink-3' : ''}>
                    <td className="py-1.5 whitespace-nowrap">{formatDate(l.date).slice(0, 5)}</td>
                    <td className="py-1.5 pr-2 max-w-[260px] truncate" title={l.description}>{l.description}</td>
                    <td className={`py-1.5 text-right tabular whitespace-nowrap ${l.amount > 0 ? 'text-good' : ''}`}>{formatBRL(l.amount)}</td>
                    <td className="py-1.5 whitespace-nowrap">
                      {l.outcome === 'match' ? <span className="pill pill-good">= {l.matchDescription}</span>
                        : l.outcome === 'duplicate' ? <span className="pill">já importada</span>
                        : <span className={`pill ${l.kind === 'transfer' ? '' : 'pill-warn'}`}>{l.kind === 'transfer' ? 'transferência' : l.categoryName ? l.categoryName : 'nova, sem categoria'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="btn btn-primary self-end"
            disabled={committing || (s.preview.counts.match + s.preview.counts.new === 0)}
            onClick={() => start(async () => {
              setCommitError(null);
              const r = await confirmImport(s.preview!.accountId, s.filename!, s.statement!, Boolean(s.invertSigns));
              if (r.ok) setResult({ matched: r.matched, inserted: r.inserted, skipped: r.skipped, forPreview: s.preview });
              else setCommitError(r.error);
            })}
          >
            {committing ? 'Importando...' : `Confirmar importação (${s.preview.counts.match + s.preview.counts.new})`}
          </button>
          {commitError ? <p className="text-sm text-bad self-end">{commitError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
