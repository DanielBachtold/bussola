import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { categoryMonths } from '@/lib/queries';
import { listGroups } from '@/lib/budget';
import { formatMonth, currentMonth } from '@/lib/dates';
import { formatBRL } from '@/lib/money';

export const metadata = { title: 'Categorias' };

/** Mês a mês por categoria: onde o dinheiro está indo ao longo do tempo. */
export default async function CategoriasPage() {
  await requireSession();
  const [{ months, rows }, groups] = await Promise.all([categoryMonths(6), listGroups()]);
  const byCat = new Map<string, { id: number | null; name: string; icon: string | null; group_id: number | null; cells: number[] }>();
  for (const r of rows) {
    const k = String(r.category_id ?? 'none');
    if (!byCat.has(k)) byCat.set(k, { id: r.category_id, name: r.name, icon: r.icon, group_id: r.group_id, cells: months.map(() => 0) });
    byCat.get(k)!.cells[months.indexOf(r.month)] = r.total;
  }
  const cats = [...byCat.values()].map((c) => {
    const past = c.cells.slice(0, -1).filter((v) => v > 0);
    const avg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0;
    const cur = c.cells[c.cells.length - 1];
    return { ...c, avg, cur, total: c.cells.reduce((a, b) => a + b, 0), delta: avg ? (cur - avg) / avg : null };
  }).sort((a, b) => b.total - a.total);
  const totals = months.map((_, i) => cats.reduce((a, c) => a + c.cells[i], 0));
  const max = Math.max(...cats.flatMap((c) => c.cells), 1);
  const groupName = (id: number | null) => groups.find((g) => g.id === id)?.name ?? null;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Categorias</h1>
        <p className="text-sm text-ink-2">Gasto mês a mês. A seta compara {formatMonth(currentMonth())} com a média dos meses anteriores.</p>
      </header>
      {!cats.length ? <p className="card p-4 text-sm text-ink-3">Nenhum gasto ainda.</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px] min-w-[620px]">
            <thead className="text-ink-3 text-left">
              <tr>
                <th className="sticky left-0 bg-surface py-2 pl-4 pr-2 font-medium">Categoria</th>
                {months.map((m) => <th key={m} className="py-2 px-2 font-medium text-right whitespace-nowrap">{formatMonth(m)}</th>)}
                <th className="py-2 px-2 font-medium text-right">vs média</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cats.map((c) => (
                <tr key={String(c.id)}>
                  <td className="sticky left-0 bg-surface py-1.5 pl-4 pr-2 whitespace-nowrap">
                    <Link href={c.id ? `/transacoes?m=${currentMonth()}&c=${c.id}` : `/transacoes?m=${currentMonth()}&c=none`} className="hover:underline">{c.icon ? `${c.icon} ` : ''}{c.name}</Link>
                    {groupName(c.group_id) ? <span className="block text-[11px] text-ink-3">{groupName(c.group_id)}</span> : null}
                  </td>
                  {c.cells.map((v, i) => (
                    <td key={i} className="py-1.5 px-2 text-right">
                      <span className="inline-block rounded px-1.5 py-0.5 min-w-[64px]" style={{ background: v ? `color-mix(in oklab, var(--s1) ${Math.round(8 + (v / max) * 42)}%, transparent)` : 'transparent' }}>
                        {v ? formatBRL(v, { cents: false }) : <span className="text-ink-3">·</span>}
                      </span>
                    </td>
                  ))}
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">
                    {c.delta === null ? <span className="text-ink-3">novo</span> : Math.abs(c.delta) < 0.1 ? <span className="pill">≈</span> : <span className={`pill ${c.delta > 0 ? 'pill-bad' : 'pill-good'}`}>{c.delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(c.delta * 100))}%</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="sticky left-0 bg-surface py-2 pl-4 pr-2">Total</td>
                {totals.map((v, i) => <td key={i} className="py-2 px-2 text-right">{formatBRL(v, { cents: false })}</td>)}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
