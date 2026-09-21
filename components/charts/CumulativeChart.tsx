'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAxis, formatBRL } from '@/lib/money';
import type { DailyPoint } from '@/lib/queries';
import { legendProps, tooltipProps } from './chartTheme';

export function CumulativeChart({ data, currentLabel, previousLabel }: { data: DailyPoint[]; currentLabel: string; previousLabel: string }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeWidth={1} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} interval={4} />
          <YAxis tickLine={false} axisLine={false} width={54} tickMargin={4} tickFormatter={formatAxis} />
          <Tooltip formatter={(v, name) => [formatBRL(Number(v)), String(name)]} labelFormatter={(d) => `Dia ${d}`} {...tooltipProps} />
          <Legend iconType="plainline" {...legendProps} />
          <Line type="monotone" dataKey="previous" name={previousLabel} stroke="var(--ink-3)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="current" name={currentLabel} stroke="var(--s1)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
