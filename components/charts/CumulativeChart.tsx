'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatBRLCompact } from '@/lib/money';
import type { DailyPoint } from '@/lib/queries';

export function CumulativeChart({ data, currentLabel, previousLabel }: { data: DailyPoint[]; currentLabel: string; previousLabel: string }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeWidth={1} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} interval={4} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatBRLCompact(v)} />
          <Tooltip
            formatter={(v, name) => [formatBRL(Number(v)), String(name)]}
            labelFormatter={(d) => `Dia ${d}`}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 13, color: 'var(--ink)' }}
            itemStyle={{ color: 'var(--ink)' }}
            labelStyle={{ color: 'var(--ink-2)' }}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--ink-2)' }} />
          <Line type="monotone" dataKey="previous" name={previousLabel} stroke="var(--axis)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="current" name={currentLabel} stroke="var(--s1)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
