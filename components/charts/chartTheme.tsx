import type { ReactNode } from 'react';

/** Estilo comum dos gráficos: tooltip na superfície, legenda em texto neutro (cor só na marca). */
export const tooltipProps = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 13, color: 'var(--ink)' },
  itemStyle: { color: 'var(--ink)' },
  labelStyle: { color: 'var(--ink-2)' },
};

export const legendProps = {
  iconSize: 12,
  wrapperStyle: { fontSize: 12, paddingTop: 8 },
  formatter: (value: ReactNode) => <span style={{ color: 'var(--ink-2)' }}>{value}</span>,
};
