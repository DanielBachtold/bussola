'use client';

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAxis, formatBRL } from '@/lib/money';
import { formatMonth } from '@/lib/dates';
import type { MonthPoint } from '@/lib/queries';
import { legendProps, tooltipProps } from './chartTheme';

export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  const rows = data.map((d) => ({ ...d, label: formatMonth(d.month) }));
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
          <CartesianGrid vertical={false} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={54} tickMargin={4} tickFormatter={formatAxis} />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} formatter={(v, name) => [formatBRL(Number(v)), String(name)]} {...tooltipProps} />
          <Legend iconType="circle" {...legendProps} iconSize={8} />
          <Bar dataKey="income" name="Receita" fill="var(--s1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="expense" name="Gasto" fill="var(--s2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
