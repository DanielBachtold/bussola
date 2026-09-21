'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatBRLCompact } from '@/lib/money';
import { formatMonth } from '@/lib/dates';
import type { MonthPoint } from '@/lib/queries';

export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  const rows = data.map((d) => ({ ...d, label: formatMonth(d.month) }));
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
          <CartesianGrid vertical={false} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatBRLCompact(v)} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            formatter={(v, name) => [formatBRL(Number(v)), String(name)]}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 13, color: 'var(--ink)' }}
            itemStyle={{ color: 'var(--ink)' }}
            labelStyle={{ color: 'var(--ink-2)' }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--ink-2)' }} />
          <Bar dataKey="income" name="Receita" fill="var(--s1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expense" name="Gasto" fill="var(--s2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
