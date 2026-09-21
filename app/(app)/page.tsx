import Link from 'next/link';
import { addMonths, currentMonth, formatMonth, invoiceDates, monthEnd, monthStart, formatDate } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import {
  categoryAverages, dailyCumulative, expensesByCategory, futureCommitments, invoiceSummaries,
  listAccounts, listCategories, listTransactions, monthTotals, monthlySeries, latestAllocation,
} from '@/lib/queries';
import { computeInsights } from '@/lib/insights';
import { getBudgetStatus } from '@/lib/budget';
import { BudgetBars } from '@/components/BudgetBars';
import { tripsAround, tripStatus } from '@/lib/trips';
import { TripCard } from '@/components/TripCard';
import { StatTile } from '@/components/StatTile';
import { MonthNav } from '@/components/MonthNav';
import { BarList } from '@/components/charts/BarList';
import { CumulativeChart } from '@/components/charts/CumulativeChart';
import { MonthlyChart } from '@/components/charts/MonthlyChart';
import { TxList } from '@/components/TxList';

export default async function Dashboard({ searchParams }: PageProps<'/'>) {
  const sp = await searchParams;
  const month = typeof sp.m === 'string' && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : currentMonth();
  const prevMonth = addMonths(month, -1);

  const [totals, prevTotals, byCat, avg, daily, series, recent, accounts, categories, insights, commitments, invoices, allocation, budget] = await Promise.all([
    monthTotals(month), monthTotals(prevMonth), expensesByCategory(monthStart(month), monthEnd(month)), categoryAverages(month, 3),
    dailyCumulative(month), monthlySeries(12), listTransactions({ month, limit: 8 }), listAccounts(), listCategories(),
    computeInsights(month), futureCommitments(), invoiceSummaries(), latestAllocation(), getBudgetStatus(month),
  ]);

  const tripStatuses = await Promise.all((await tripsAround()).map((t) => tripStatus(t)));
  const avgTotal = [...avg.values()].reduce((a, b) => a + b, 0);
  const balance = totals.income - totals.expense;
  const checking = accounts.filter((a) => a.kind === 'checking' && a.balance !== null);
  const checkingTotal = checking.reduce((a, c) => a + (c.balance ?? 0), 0);
  const invested = allocation.reduce((a, s) => a + s.balance, 0);

  // fatura "aberta" de cada cartão: a que fecha neste mês ou no próximo
  const cards = accounts.filter((a) => a.kind === 'credit_card' && a.closing_day && a.due_day);
  const openInvoices = cards.map((card) => {
    const today = new Date();
    const m = today.getDate() > card.closing_day! ? addMonths(currentMonth(), 1) : currentMonth();
    const inv = invoices.find((i) => i.account_id === card.id && i.invoice_month === m);
    const { closes, due } = invoiceDates(m, card.closing_day!, card.due_day!);
    return { card, month: m, total: inv?.total ?? 0, closes, due };
  });
  const openTotal = openInvoices.reduce((a, i) => a + i.total, 0);
  const committed = commitments.reduce((a, c) => a + c.total, 0);

  const top = byCat.slice(0, 8);
  const rest = byCat.slice(8);
  const barItems = top.map((c) => ({
    label: `${c.icon ?? ''} ${c.name}`.trim(),
    value: c.total,
    marker: avg.get(c.category_id) ?? null,
    hint: `${c.count}`,
    href: c.category_id ? `/transacoes?m=${month}&c=${c.category_id}` : `/transacoes?m=${month}`,
  }));
  if (rest.length) barItems.push({ label: `Outras ${rest.length}`, value: rest.reduce((a, c) => a + c.total, 0), marker: null, hint: `${rest.reduce((a, c) => a + c.count, 0)}`, href: `/transacoes?m=${month}` });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-ink-2">Onde o dinheiro está indo neste mês.</p>
        </div>
        <MonthNav month={month} basePath="/" />
      </header>

      {!accounts.length ? (
        <div className="card p-5 flex flex-col gap-2">
          <p className="font-semibold">Comece cadastrando suas contas</p>
          <p className="text-sm text-ink-2">Conta corrente, cartões (com dia de fechamento e vencimento) e corretoras. Depois importe um extrato ou lance gastos pela barra rápida.</p>
          <Link href="/config" className="btn btn-primary self-start">Cadastrar contas</Link>
        </div>
      ) : null}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Gasto no mês" value={totals.expense} delta={avgTotal ? { pct: (totals.expense - avgTotal) / avgTotal } : null} hint={avgTotal ? `média 3m ${formatBRL(avgTotal)}` : `${totals.expenseCount} lançamentos`} />
        <StatTile label="Receita" value={totals.income} delta={prevTotals.income ? { pct: (totals.income - prevTotals.income) / prevTotals.income, goodWhenDown: false } : null} hint={prevTotals.income ? `${formatMonth(prevMonth)} ${formatBRL(prevTotals.income)}` : undefined} />
        <StatTile label="Resultado" value={balance} tone={balance < 0 ? 'bad' : 'good'} hint={totals.income ? `${Math.round((balance / totals.income) * 100)}% da receita` : 'sem receita registrada'} />
        <StatTile label="Faturas abertas" value={openTotal} hint={openInvoices.length ? openInvoices.map((i) => `${i.card.name} vence ${formatDate(i.due).slice(0, 5)}`).join(' · ') : 'nenhum cartão'} />
      </section>

      {tripStatuses.length ? (
        <section className="card p-4 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Viagem</h2>
            <Link href="/viagens" className="text-[13px] text-accent">ver</Link>
          </div>
          {tripStatuses.map((s) => <TripCard key={s.trip.id} s={s} />)}
        </section>
      ) : null}

      <section id="orcamento" className="card p-4 flex flex-col gap-3 scroll-mt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Orçamento <span className="text-ink-3 font-normal text-[13px]">por percentual da renda</span></h2>
          <Link href="/config#orcamento" className="text-[13px] text-accent">configurar</Link>
        </div>
        <BudgetBars status={budget} />
      </section>

      {insights.length ? (
        <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {insights.map((i, idx) => (
            <div key={idx} className={`card p-4 border-l-4 ${i.tone === 'good' ? 'border-l-good' : i.tone === 'warning' ? 'border-l-warn' : 'border-l-border-strong'}`}>
              <p className="text-[14px] font-semibold leading-snug">{i.title}</p>
              <p className="text-[13px] text-ink-2 mt-1">{i.detail}</p>
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-2 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Por categoria</h2>
            <Link href={`/transacoes?m=${month}`} className="text-[13px] text-accent">ver tudo</Link>
          </div>
          <BarList items={barItems} markerLabel="média dos últimos 3 meses" />
        </div>
        <div className="card p-4 lg:col-span-3 flex flex-col gap-3">
          <h2 className="font-semibold">Ritmo do mês <span className="text-ink-3 font-normal text-[13px]">gasto acumulado por dia</span></h2>
          <CumulativeChart data={daily} currentLabel={formatMonth(month)} previousLabel={formatMonth(prevMonth)} />
        </div>
      </section>

      <section className="grid lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-3 flex flex-col gap-3">
          <h2 className="font-semibold">Últimos 12 meses</h2>
          <MonthlyChart data={series} />
        </div>
        <div className="card p-4 lg:col-span-2 flex flex-col gap-3">
          <h2 className="font-semibold">Posição</h2>
          <dl className="flex flex-col divide-y divide-border text-[14px]">
            {checking.map((c) => (
              <div key={c.id} className="flex justify-between py-2"><dt className="text-ink-2">{c.name} <span className="text-ink-3 text-[12px]">em {formatDate(c.balance_at!).slice(0, 5)}</span></dt><dd className="tabular font-medium">{formatBRL(c.balance)}</dd></div>
            ))}
            {checking.length > 1 ? <div className="flex justify-between py-2"><dt className="text-ink-2">Em conta</dt><dd className="tabular font-semibold">{formatBRL(checkingTotal)}</dd></div> : null}
            <div className="flex justify-between py-2"><dt className="text-ink-2">Investido</dt><dd className="tabular font-semibold">{invested ? formatBRL(invested) : <Link href="/investimentos" className="text-accent text-[13px]">registrar</Link>}</dd></div>
            <div className="flex justify-between py-2"><dt className="text-ink-2">Parcelas futuras</dt><dd className={`tabular font-semibold ${committed ? 'text-warn' : ''}`}>{formatBRL(committed)}</dd></div>
            {commitments.slice(0, 4).map((c) => (
              <div key={c.month} className="flex justify-between py-1.5 text-[13px]"><dt className="text-ink-3 pl-3">{formatMonth(c.month)} · {c.count} parc.</dt><dd className="tabular text-ink-2">{formatBRL(c.total)}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="card p-4 flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Últimos lançamentos</h2>
          <Link href={`/transacoes?m=${month}`} className="text-[13px] text-accent">extrato completo</Link>
        </div>
        <TxList items={recent} categories={categories} />
      </section>
    </div>
  );
}
