import Link from 'next/link';
import { addMonths, currentMonth, formatMonth } from '@/lib/dates';

export function MonthNav({ month, basePath, extra = '' }: { month: string; basePath: string; extra?: string }) {
  const prev = addMonths(month, -1), next = addMonths(month, 1);
  const isCurrent = month === currentMonth();
  return (
    <div className="flex items-center gap-1">
      <Link href={`${basePath}?m=${prev}${extra}`} className="btn btn-ghost btn-sm" aria-label="Mês anterior">‹</Link>
      <span className="px-2 text-[15px] font-semibold min-w-[150px] text-center">{formatMonth(month, true)}</span>
      <Link href={`${basePath}?m=${next}${extra}`} className="btn btn-ghost btn-sm" aria-label="Próximo mês">›</Link>
      {!isCurrent ? <Link href={`${basePath}${extra ? `?${extra.slice(1)}` : ''}`} className="btn btn-ghost btn-sm">Hoje</Link> : null}
    </div>
  );
}
