'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatBRLCompact } from '@/lib/money';
import { formatMonth } from '@/lib/dates';
import type { NetWorthPoint } from '@/lib/queries';

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
          <YAxis tickLine={false} axisLine={false} width={60} tickFormatter={(v) => formatBRLCompact(v)} />
          <Tooltip
            formatter={(v, name) => [formatBRL(Number(v)), String(name)]}
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 10, fontSize: 13, color: 'var(--ink)' }}
            itemStyle={{ color: 'var(--ink)' }}
            labelStyle={{ color: 'var(--ink-2)' }}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: 'var(--ink-2)' }} />
          <Line type="monotone" dataKey="total" name="Patrimônio investido" stroke="var(--s1)" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: 'var(--s1)' }} isAnimationActive={false} />
          <Line type="monotone" dataKey="aportes" name="Aportes acumulados" stroke="var(--s2)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
