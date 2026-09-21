import Link from 'next/link';
import { formatBRL } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import type { TripStatus } from '@/lib/trips';

const TONE = { ok: 'var(--good)', warn: 'var(--warn)', over: 'var(--bad)', none: 'var(--s1)' } as const;

/** Resumo de uma viagem: teto, gasto, ritmo por dia. */
export function TripCard({ s, compact = false }: { s: TripStatus; compact?: boolean }) {
  const t = s.trip;
  const width = Math.min(s.pct * 100, 100);
  const phaseLabel = s.phase === 'active' ? `dia ${s.daysElapsed} de ${s.daysTotal}` : s.phase === 'upcoming' ? `começa em ${formatDate(t.start_date)}` : 'encerrada';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          <Link href={`/viagens?v=${t.id}`} className="font-semibold hover:underline">{t.name}</Link>
          <span className="block text-[12px] text-ink-3">{formatDate(t.start_date)} a {formatDate(t.end_date)} · {phaseLabel}</span>
        </span>
        <span className="tabular text-right shrink-0">
          <span className="text-[18px] font-semibold">{formatBRL(s.spent)}</span>
          <span className="block text-[12px] text-ink-3">de {formatBRL(t.budget)}{t.budget > 0 ? ` · ${Math.round(s.pct * 100)}%` : ''}</span>
        </span>
      </div>
      <div className="relative h-[8px] rounded-[4px] bg-surface-2 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${width}%`, background: TONE[s.status] }} />
        {s.phase === 'active' && s.daysTotal > 0 ? <div className="absolute inset-y-0 w-px bg-ink-3/70" style={{ left: `${(s.daysElapsed / s.daysTotal) * 100}%` }} title="onde você deveria estar pelo tempo" aria-hidden /> : null}
      </div>
      {!compact ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
          {s.phase !== 'upcoming' ? <span>{formatBRL(s.perDaySoFar)}/dia até agora</span> : null}
          {s.perDayAllowed !== null && s.phase !== 'past' ? <span>{formatBRL(s.perDayAllowed)}/dia pra fechar no teto{s.daysLeft ? ` (${s.daysLeft} dias)` : ''}</span> : null}
          {s.status === 'over' ? <span className="text-bad font-medium">{formatBRL(s.spent - t.budget)} acima do teto</span> : null}
          {s.prepaid ? <span className="text-ink-3">pré-pago fora do teto: {formatBRL(s.prepaid)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
