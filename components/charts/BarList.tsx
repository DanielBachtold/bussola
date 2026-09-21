import { formatBRL } from '@/lib/money';

export type BarListItem = { label: string; value: number; hint?: string; marker?: number | null; color?: string; href?: string };

/**
 * Lista de barras horizontais em HTML: uma série, uma cor, rótulo direto.
 * `marker` desenha um tique (média ou orçamento) sobre a barra.
 */
export function BarList({ items, color = 'var(--s1)', markerLabel }: { items: BarListItem[]; color?: string; markerLabel?: string }) {
  const max = Math.max(...items.map((i) => Math.max(i.value, i.marker ?? 0)), 1);
  if (!items.length) return <p className="text-sm text-ink-3">Nada por aqui ainda.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it) => {
        const w = Math.max((it.value / max) * 100, 0.5);
        const m = it.marker != null ? (it.marker / max) * 100 : null;
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-ink">{it.label}</span>
              <span className="tabular text-ink-2 shrink-0">{formatBRL(it.value)}{it.hint ? <span className="text-ink-3"> · {it.hint}</span> : null}</span>
            </div>
            <div className="relative h-[7px] rounded-[4px] bg-surface-2 overflow-visible" title={m != null && markerLabel ? `${markerLabel}: ${formatBRL(it.marker!)}` : undefined}>
              <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${w}%`, background: it.color ?? color }} />
              {m != null ? <div className="absolute -top-[3px] h-[13px] w-[3px] rounded bg-ink" style={{ left: `calc(${Math.min(m, 99)}% - 1.5px)`, boxShadow: '0 0 0 2px var(--surface)' }} aria-label={markerLabel} /> : null}
            </div>
          </>
        );
        return it.href ? (
          <a key={it.label} href={it.href} className="flex flex-col gap-1 rounded-md hover:bg-surface-2 -mx-1 px-1 py-0.5">{content}</a>
        ) : (
          <div key={it.label} className="flex flex-col gap-1">{content}</div>
        );
      })}
      {markerLabel && items.some((i) => i.marker != null) ? (
        <p className="text-[11px] text-ink-3 flex items-center gap-1.5"><span className="inline-block h-[10px] w-[3px] bg-ink rounded" /> {markerLabel}</p>
      ) : null}
    </div>
  );
}
