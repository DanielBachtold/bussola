import Link from 'next/link';
import { formatBRL } from '@/lib/money';
import type { BudgetStatus } from '@/lib/budget';

const TONE = { ok: 'var(--good)', warn: 'var(--warn)', over: 'var(--bad)', none: 'var(--axis)', pending: 'var(--s1)' } as const;

/** Barras de orçamento por grupo: quanto do limite do mês já foi usado. */
export function BudgetBars({ status, compact = false }: { status: BudgetStatus; compact?: boolean }) {
  if (!status.groups.length) {
    return <p className="text-sm text-ink-3">Nenhum grupo de orçamento. <Link href="/config#orcamento" className="text-accent">Configurar</Link>.</p>;
  }
  const over = status.alerts.filter((a) => a.tone === 'bad').length;
  const warn = status.alerts.length - over;
  // escala comum: um grupo em 161% passa visivelmente do tique do limite, um em 112% passa pouco
  const scale = Math.max(1, ...status.groups.map((g) => g.pct));
  const limitLeft = 100 / scale;
  return (
    <div className="flex flex-col gap-3.5">
      {!compact && status.alerts.length ? (
        <p className={`text-[13px] font-medium ${over ? 'text-bad' : 'text-warn'}`}>
          {over ? `${over} grupo${over > 1 ? 's' : ''} ${over > 1 ? 'passaram' : 'passou'} do limite` : ''}{over && warn ? ', ' : ''}{warn ? `${warn} chegando no limite` : ''}.
        </p>
      ) : null}
      {status.groups.map((g) => {
        const width = Math.min((g.pct / scale) * 100, 100);
        const isInvest = g.group.basis === 'investment';
        const pill = g.status !== 'none' ? <span className={`pill !text-[11px] ${g.status === 'ok' && g.spent > 0 ? 'pill-good' : g.status === 'warn' ? 'pill-warn' : g.status === 'over' ? 'pill-bad' : ''}`}>{Math.round(g.pct * 100)}%</span> : null;
        const line3 = g.status === 'none' ? null
          : isInvest ? (g.pct >= 1 ? 'meta batida' : `faltam ${formatBRL(g.limit - g.spent, { cents: false })} pra meta`)
          : g.spent > g.limit ? `${formatBRL(g.spent - g.limit, { cents: false })} acima`
          : g.perDayLeft !== null ? `sobram ${formatBRL(g.limit - g.spent, { cents: false })} · ${formatBRL(g.perDayLeft, { cents: false })}/dia por ${status.daysLeft} dia${status.daysLeft > 1 ? 's' : ''}`
          : `sobraram ${formatBRL(g.limit - g.spent, { cents: false })}`;
        return (
          <div key={g.group.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className="font-medium min-w-0">
                {g.group.name} <span className="text-ink-3 font-normal">· {g.group.percent}%{isInvest ? ' · meta de aporte' : ''}</span>
                {!compact && g.categories.length ? <span className="text-ink-3 font-normal hidden lg:inline"> · {g.categories.map((c) => c.name).join(', ')}</span> : null}
              </span>
              <span className="shrink-0 flex items-center gap-1.5 text-ink-2">
                <span className="hidden sm:inline">{formatBRL(g.spent, { cents: false })} <span className="text-ink-3">de {formatBRL(g.limit, { cents: false })}</span></span>
                {pill}
              </span>
            </div>
            <div className="relative h-[7px] rounded-[4px] bg-surface-2">
              <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${width}%`, background: TONE[g.status] }} />
              {scale > 1 ? <div className="absolute -top-[3px] h-[13px] w-[2px] bg-ink" style={{ left: `calc(${limitLeft}% - 1px)`, boxShadow: '0 0 0 2px var(--surface)' }} title="limite do grupo" aria-hidden /> : null}
              {status.elapsedPct !== null && !isInvest ? <div className="absolute -top-[2px] h-[11px] w-px bg-ink-3/70" style={{ left: `${Math.min(status.elapsedPct * limitLeft, 100)}%` }} title="onde o mês está" aria-hidden /> : null}
            </div>
            <p className="text-[12px] text-ink-3 leading-snug">
              <span className="sm:hidden">{formatBRL(g.spent, { cents: false })} de {formatBRL(g.limit, { cents: false })}{line3 ? ' · ' : ''}</span>
              {line3}
            </p>
          </div>
        );
      })}
      {!compact ? (
        <p className="text-[11px] text-ink-3 flex flex-wrap gap-x-3 gap-y-1">
          <span>Limites sobre {formatBRL(status.base, { cents: false })} ({status.baseSource}).</span>
          {scale > 1 ? <span className="inline-flex items-center gap-1"><span className="inline-block h-[10px] w-[2px] bg-ink" /> limite</span> : null}
          {status.elapsedPct !== null ? <span className="inline-flex items-center gap-1"><span className="inline-block h-[10px] w-px bg-ink-3/70" /> dia de hoje</span> : null}
          {status.totalPercent !== 100 ? <span>Os percentuais somam {status.totalPercent}%.</span> : null}
          {status.unassigned.spent > 0 ? <span>Fora dos grupos: {formatBRL(status.unassigned.spent, { cents: false })}.</span> : null}
          <Link href="/config#orcamento" className="text-accent">Ajustar</Link>
        </p>
      ) : null}
    </div>
  );
}

export type TopAlert = { key: string; tone: 'warning' | 'bad'; title: string; detail: string; href: string };
