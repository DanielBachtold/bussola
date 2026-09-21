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
  return (
    <div className="flex flex-col gap-3">
      {!compact && status.alerts.length ? (
        <p className={`text-[13px] font-medium ${over ? 'text-bad' : 'text-warn'}`}>
          {over ? `${over} grupo${over > 1 ? 's' : ''} passou do limite` : ''}{over && warn ? ', ' : ''}{warn ? `${warn} chegando no limite` : ''}.
        </p>
      ) : null}
      {status.groups.map((g) => {
        const width = Math.min(g.pct * 100, 100);
        const isInvest = g.group.basis === 'investment';
        const pill = g.status !== 'none' ? <span className={`pill !text-[11px] ${g.status === 'ok' && g.spent > 0 ? 'pill-good' : g.status === 'warn' ? 'pill-warn' : g.status === 'over' ? 'pill-bad' : ''}`}>{Math.round(g.pct * 100)}%</span> : null;
        const amounts = <>{formatBRL(g.spent, { cents: false })} <span className="text-ink-3">de {formatBRL(g.limit, { cents: false })}</span></>;
        return (
          <div key={g.group.id} className="flex flex-col gap-1">
            {compact ? (
              // celular: nome inteiro numa linha, valores na outra
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="font-medium min-w-0">{g.group.name} <span className="text-ink-3 font-normal">· {g.group.percent}%</span></span>
                <span className="shrink-0 flex items-center gap-1.5 text-ink-2">{amounts}{pill}</span>
              </div>
            ) : (
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate">
                  <span className="font-medium">{g.group.name}</span>
                  <span className="text-ink-3"> · {g.group.percent}%</span>
                  {g.categories.length ? <span className="text-ink-3 hidden sm:inline"> · {g.categories.map((c) => c.name).join(', ')}</span> : null}
                </span>
                <span className="shrink-0 text-ink-2 flex items-center gap-1.5">{amounts}{pill}</span>
              </div>
            )}
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

export type TopAlert = { key: string; tone: 'warning' | 'bad'; title: string; detail: string; href: string };
