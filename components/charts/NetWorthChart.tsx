'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAxis, formatBRL } from '@/lib/money';
import { formatMonth } from '@/lib/dates';
import type { NetWorthPoint } from '@/lib/queries';
import { legendProps, tooltipProps } from './chartTheme';

export function NetWorthChart({ data }: { data: NetWorthPoint[] }) {
  const rows = data.reduce<Array<{ label: string; total: number; aportes: number }>>((out, d) => {
    const acc = (out[out.length - 1]?.aportes ?? 0) + d.contributions;
    out.push({ label: formatMonth(d.month), total: d.total, aportes: Math.round(acc * 100) / 100 });
    return out;
  }, []);
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={58} tickMargin={4} tickFormatter={formatAxis} />
          <Tooltip formatter={(v, name) => [formatBRL(Number(v)), String(name)]} {...tooltipProps} />
          <Legend iconType="plainline" {...legendProps} />
          <Line type="monotone" dataKey="total" name="Patrimônio investido" stroke="var(--s1)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: 'var(--s1)' }} isAnimationActive={false} />
          <Line type="monotone" dataKey="aportes" name="Aportes acumulados" stroke="var(--s2)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
