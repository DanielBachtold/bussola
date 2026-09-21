import { formatBRL } from '@/lib/money';

export function StatTile({
  label, value, hint, delta, tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  delta?: { pct: number; goodWhenDown?: boolean } | null;
  tone?: 'good' | 'warn' | 'bad';
}) {
  // abaixo de 10% é variação normal de mês: mostra a seta, sem cor de alarme
  const deltaTone = delta
    ? Math.abs(delta.pct) < 0.10 ? '' : (delta.pct < 0) === (delta.goodWhenDown ?? true) ? 'pill-good' : 'pill-bad'
    : '';
  return (
    <div className="card p-4 flex flex-col gap-1 min-w-0">
      <span className="text-[12px] uppercase tracking-wide text-ink-3 font-medium">{label}</span>
      <span className={`text-[20px] sm:text-[24px] lg:text-[28px] font-semibold leading-tight whitespace-nowrap ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : ''}`}>
        {typeof value === 'number' ? formatBRL(value) : value}
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-2 min-h-[18px] leading-tight">
        {delta && Math.abs(delta.pct) >= 0.005 ? (
          <span className={`pill whitespace-nowrap ${deltaTone}`}>{delta.pct > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta.pct * 100))}%</span>
        ) : null}
        {hint ? <span className="line-clamp-2">{hint}</span> : null}
      </div>
    </div>
  );
}
