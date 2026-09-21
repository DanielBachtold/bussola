'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addMonths, currentMonth, formatMonth } from '@/lib/dates';

/** Setas de 44px no celular e o mês como select: voltar 8 meses é um toque, não oito. */
export function MonthNav({ month, basePath, extra = '' }: { month: string; basePath: string; extra?: string }) {
  const router = useRouter();
  const prev = addMonths(month, -1), next = addMonths(month, 1);
  const isCurrent = month === currentMonth();
  const options = Array.from({ length: 27 }, (_, i) => addMonths(currentMonth(), 3 - i));
  if (!options.includes(month)) options.push(month);
  const go = (m: string) => router.push(`${basePath}?m=${m}${extra}`);

  return (
    <div className="flex items-center gap-1">
      <Link href={`${basePath}?m=${prev}${extra}`} className="btn btn-ghost !p-0 w-11 h-11 md:w-9 md:h-9 text-[18px]" aria-label="Mês anterior">‹</Link>
      <select
        className="appearance-none bg-transparent text-[15px] font-semibold text-center min-w-[150px] cursor-pointer outline-none"
        value={month}
        onChange={(e) => go(e.target.value)}
        aria-label="Mês"
      >
        {options.sort().reverse().map((m) => <option key={m} value={m}>{formatMonth(m, true)}</option>)}
      </select>
      <Link href={`${basePath}?m=${next}${extra}`} className="btn btn-ghost !p-0 w-11 h-11 md:w-9 md:h-9 text-[18px]" aria-label="Próximo mês">›</Link>
      {!isCurrent ? <Link href={`${basePath}${extra ? `?${extra.slice(1)}` : ''}`} className="btn btn-ghost btn-sm">Mês atual</Link> : null}
    </div>
  );
}
