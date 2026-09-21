import Link from 'next/link';
import { currentMonth, formatMonth } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { latestAllocation, listAccounts, listSnapshots, netWorthSeries } from '@/lib/queries';
import { NetWorthChart } from '@/components/charts/NetWorthChart';
import { BarList } from '@/components/charts/BarList';
import { StatTile } from '@/components/StatTile';
import { SnapshotForm, SnapshotTable } from './SnapshotForm';

export const metadata = { title: 'Investimentos' };

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

export default async function InvestimentosPage() {
  const accounts = (await listAccounts()).filter((a) => a.kind === 'investment');
  const [snapshots, series, allocation] = await Promise.all([listSnapshots(), netWorthSeries(), latestAllocation()]);
  const total = allocation.reduce((a, s) => a + s.balance, 0);
  const contributions = series.reduce((a, p) => a + p.contributions, 0);
  const first = series[0]?.total ?? 0;
  const gain = total - first - series.slice(1).reduce((a, p) => a + p.contributions, 0);
  const latestMonth = allocation[0]?.month;
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const last = series[series.length - 1];
  const monthReturn = prev && last ? last.total - prev.total - last.contributions : null;

  // alocação por ativo: até 7 + "Outros", cor por identidade
  const sorted = [...allocation].sort((a, b) => b.balance - a.balance);
  const shown = sorted.slice(0, 7);
  const others = sorted.slice(7);
  const items = shown.map((s, i) => ({ label: `${s.asset} · ${s.account_name}`, value: s.balance, hint: `${Math.round((s.balance / total) * 100)}%`, color: SERIES[i] }));
  if (others.length) items.push({ label: `Outros ${others.length}`, value: others.reduce((a, s) => a + s.balance, 0), hint: `${Math.round((others.reduce((a, s) => a + s.balance, 0) / total) * 100)}%`, color: 'var(--axis)' });

  // por classe
  const byClass = new Map<string, number>();
  for (const s of allocation) byClass.set(s.asset_class ?? 'Sem classe', (byClass.get(s.asset_class ?? 'Sem classe') ?? 0) + s.balance);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Investimentos</h1>
        <p className="text-sm text-ink-2">Uma vez por mês, registre o saldo de cada ativo. Os aportes o sistema já conhece (transferências pra conta de investimento), então a rentabilidade sai daí.</p>
      </header>

      {!accounts.length ? (
        <div className="card p-5 flex flex-col gap-2 max-w-xl">
          <p className="font-semibold">Cadastre uma conta do tipo Investimentos</p>
          <p className="text-sm text-ink-2">Ex.: Rico, BTG. Depois registre as posições aqui.</p>
          <Link href="/config" className="btn btn-primary self-start">Cadastrar</Link>
        </div>
      ) : null}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Patrimônio investido" value={total} hint={latestMonth ? `posição de ${formatMonth(latestMonth)}` : 'sem posição'} />
        <StatTile label="Rendimento no mês" value={monthReturn ?? 0} tone={monthReturn == null ? undefined : monthReturn >= 0 ? 'good' : 'bad'} hint={prev && last ? `${formatMonth(prev.month)} → ${formatMonth(last.month)}` : 'precisa de 2 meses'} />
        <StatTile label="Rendimento acumulado" value={series.length > 1 ? gain : 0} tone={gain >= 0 ? 'good' : 'bad'} hint={series.length > 1 ? `desde ${formatMonth(series[0].month)}` : 'precisa de 2 meses'} />
        <StatTile label="Aportes registrados" value={contributions} hint="transferências pra investimento" />
      </section>

      {series.length ? (
        <section className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold">Evolução</h2>
          <NetWorthChart data={series} />
        </section>
      ) : null}

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold">Alocação {latestMonth ? <span className="text-ink-3 font-normal text-[13px]">{formatMonth(latestMonth)}</span> : null}</h2>
          <BarList items={items} />
          {byClass.size > 1 ? (
            <dl className="text-[13px] flex flex-wrap gap-x-4 gap-y-1 pt-2 hairline">
              {[...byClass.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="flex gap-1"><dt className="text-ink-3">{k}</dt><dd className="tabular">{Math.round((v / total) * 100)}%</dd></div>)}
            </dl>
          ) : null}
        </div>
        <div className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold">Registrar posição</h2>
          <SnapshotForm accounts={accounts} defaultMonth={currentMonth()} knownAssets={[...new Set(snapshots.map((s) => s.asset))]} />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-2">Histórico de posições</h2>
        <SnapshotTable snapshots={snapshots} />
      </section>
      <p className="text-[12px] text-ink-3">Total registrado: {formatBRL(total)}.</p>
    </div>
  );
}
