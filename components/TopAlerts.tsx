'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { TopAlert } from './BudgetBars';

/**
 * Uma linha no topo das páginas quando algo passou (ou está chegando) do limite.
 * Não aparece no Painel (o card de Orçamento já mostra), nem em Lançar, Chat e
 * Importar, onde a ação principal precisa do espaço.
 */
export function TopAlerts({ alerts }: { alerts: TopAlert[] }) {
  const pathname = usePathname();
  if (!alerts.length || ['/', '/lancar', '/chat', '/importar'].includes(pathname)) return null;
  const bad = alerts.filter((a) => a.tone === 'bad');
  const tone = bad.length ? 'bad' : 'warning';
  const single = alerts.length === 1 ? alerts[0] : null;
  const text = single
    ? `${single.title}: ${single.detail}`
    : bad.length ? (bad.length === 1 ? `${bad[0].title}` : `${bad.length} grupos passaram do limite`) : `${alerts.length} alertas de orçamento`;
  return (
    <Link
      href={single?.href ?? '/#orcamento'}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-4 text-[13px] leading-snug ${tone === 'bad' ? 'bg-bad-bg text-bad' : 'bg-warn-bg text-warn'}`}
    >
      {tone === 'bad' ? <TriangleAlert size={16} className="shrink-0" aria-hidden /> : <CircleAlert size={16} className="shrink-0" aria-hidden />}
      <span className="flex-1 min-w-0 truncate">{text}</span>
      <span className="shrink-0 underline underline-offset-2">ver</span>
    </Link>
  );
}
