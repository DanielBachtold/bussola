import Link from 'next/link';
import { formatBRL } from '@/lib/money';
import type { BudgetStatus } from '@/lib/budget';

const TONE = { ok: 'var(--good)', warn: 'var(--warn)', over: 'var(--bad)', none: 'var(--axis)', pending: 'var(--s1)' } as const;

/** Barras de orçamento por grupo: quanto do limite do mês já foi usado. */
export function BudgetBars({ status, compact = false }: { status: BudgetStatus; compact?: boolean }) {
  if (!status.groups.length) {
    return <p className="text-sm text-ink-3">Nenhum grupo de orçamento. <Link href="/config#orcamento" className="text-accent">Configurar</Link>.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {status.groups.map((g) => {
        const width = Math.min(g.pct * 100, 100);
        const isInvest = g.group.basis === 'investment';
        return (
          <div key={g.group.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate">
                <span className="font-medium">{g.group.name}</span>
                <span className="text-ink-3"> · {g.group.percent}%</span>
                {!compact && g.categories.length ? <span className="text-ink-3 hidden sm:inline"> · {g.categories.map((c) => c.name).join(', ')}</span> : null}
              </span>
              <span className="tabular shrink-0 text-ink-2">
                {formatBRL(g.spent)} <span className="text-ink-3">/ {formatBRL(g.limit)}</span>
                {g.status !== 'none' ? <span className={`ml-1.5 pill !text-[11px] ${g.status === 'ok' ? 'pill-good' : g.status === 'warn' ? 'pill-warn' : g.status === 'over' ? 'pill-bad' : ''}`}>{Math.round(g.pct * 100)}%</span> : null}
              </span>
            </div>
            <div className="relative h-[7px] rounded-[4px] bg-surface-2 overflow-hidden">
              <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${width}%`, background: TONE[g.status] }} />
              {status.threshold < 1 ? <div className="absolute inset-y-0 w-px bg-ink-3/60" style={{ left: `${status.threshold * 100}%` }} aria-hidden /> : null}
            </div>
            {isInvest && !compact ? <p className="text-[11px] text-ink-3">meta de aporte: entra o que for transferido pra conta de investimento</p> : null}
          </div>
        );
      })}
      {!compact ? (
        <p className="text-[11px] text-ink-3">
          Base: {formatBRL(status.base)} ({status.baseSource}).
          {status.totalPercent !== 100 ? ` Os percentuais somam ${status.totalPercent}%.` : ''}
          {status.unassigned.spent > 0 ? ` Fora dos grupos: ${formatBRL(status.unassigned.spent)}.` : ''}
          {' '}<Link href="/config#orcamento" className="text-accent">Ajustar</Link>
        </p>
      ) : null}
    </div>
  );
}

/** Faixa de alerta no topo das páginas, só quando há algo chegando no limite ou estourado. */
export type TopAlert = { key: string; tone: 'warning' | 'bad'; title: string; detail: string; href: string };

export function BudgetAlerts({ alerts }: { alerts: TopAlert[] }) {
  if (!alerts.length) return null;
  return (
    <div className="flex flex-col gap-2 mb-4">
      {alerts.map((a) => (
        <Link key={a.key} href={a.href} className={`card px-4 py-2.5 flex items-center gap-3 text-[13px] border-l-4 ${a.tone === 'bad' ? 'border-l-bad' : 'border-l-warn'}`}>
          <span aria-hidden>{a.tone === 'bad' ? '⚠' : '◔'}</span>
          <span className="flex-1"><span className="font-semibold">{a.title}.</span> <span className="text-ink-2">{a.detail}</span></span>
        </Link>
      ))}
    </div>
  );
}
