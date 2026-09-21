'use client';

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAxis, formatBRL } from '@/lib/money';
import type { DailyPoint } from '@/lib/queries';
import { legendProps, tooltipProps } from './chartTheme';

/** Gasto acumulado por dia, contra o mês anterior, com o teto do orçamento e a projeção no ritmo atual. */
export function CumulativeChart({ data, currentLabel, previousLabel, ceiling = null }: { data: DailyPoint[]; currentLabel: string; previousLabel: string; ceiling?: number | null }) {
  // projeção: reta do último dia com dado até o fim do mês, no ritmo médio até aqui
  const lastIdx = data.reduce((acc, d, i) => (d.current !== null ? i : acc), -1);
  const last = lastIdx >= 0 ? data[lastIdx] : null;
  const rate = last && last.current !== null && last.day > 0 ? last.current / last.day : 0;
  const rows = data.map((d, i) => ({ ...d, projected: last && i >= lastIdx && lastIdx < data.length - 1 ? Math.round(rate * d.day * 100) / 100 : null }));
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeWidth={1} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} interval={4} />
          <YAxis tickLine={false} axisLine={false} width={54} tickMargin={4} tickFormatter={formatAxis} />
          <Tooltip formatter={(v, name) => [formatBRL(Number(v)), String(name)]} labelFormatter={(d) => `Dia ${d}`} {...tooltipProps} />
          <Legend iconType="plainline" {...legendProps} />
          <Line type="monotone" dataKey="previous" name={previousLabel} stroke="var(--ink-3)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          {ceiling ? <ReferenceLine y={ceiling} stroke="var(--bad)" strokeWidth={1} label={{ value: 'teto', position: 'insideTopRight', fill: 'var(--bad)', fontSize: 11 }} /> : null}
          <Line type="monotone" dataKey="projected" name="projeção" stroke="var(--s1)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="current" name={currentLabel} stroke="var(--s1)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
