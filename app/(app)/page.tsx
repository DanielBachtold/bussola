import Link from 'next/link';
import { addMonths, currentMonth, formatMonth, invoiceDates, monthEnd, monthStart, formatDate, openInvoiceMonth, todayDay } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import {
  categoryAverages, dailyCumulative, expensesByCategory, futureCommitments, invoiceSummaries,
  listAccounts, listCategories, listTransactions, monthTotals, monthlySeries, latestAllocation,
} from '@/lib/queries';
import { computeInsights } from '@/lib/insights';
import { monthParam } from '@/lib/params';
import { getBudgetStatus } from '@/lib/budget';
import { pool } from '@/lib/db';
import { BudgetBars } from '@/components/BudgetBars';
import { tripsAround, tripStatus } from '@/lib/trips';
import { daysUntil, pendingFixedThisMonth, postRecurring, upcoming } from '@/lib/recurring';
import { TripCard } from '@/components/TripCard';
import { StatTile } from '@/components/StatTile';
import { MonthNav } from '@/components/MonthNav';
import { BarList } from '@/components/charts/BarList';
import { CumulativeChart } from '@/components/charts/CumulativeChart';
import { MonthlyChart } from '@/components/charts/MonthlyChart';
import { TxList } from '@/components/TxList';

import { requireSession } from '@/lib/session';

const isCurrentMonth = (m: string) => m === currentMonth();

export default async function Dashboard({ searchParams }: PageProps<'/'>) {
  await requireSession();
  await postRecurring().catch(() => 0);
  const sp = await searchParams;
  const month = monthParam(sp.m) ?? currentMonth();
  const prevMonth = addMonths(month, -1);

  const [totals, , byCat, avg, daily, series, recent, accounts, categories, insights, commitments, invoices, allocation, budget] = await Promise.all([
    monthTotals(month), monthTotals(prevMonth), expensesByCategory(monthStart(month), monthEnd(month)), categoryAverages(month, 3),
    dailyCumulative(month), monthlySeries(12), listTransactions({ month, limit: 8 }), listAccounts(), listCategories(),
    computeInsights(month), futureCommitments(), invoiceSummaries(), latestAllocation(), getBudgetStatus(month),
  ]);

  const tripStatuses = await Promise.all((await tripsAround()).map((t) => tripStatus(t)));
  const [next30, fixedPending] = await Promise.all([isCurrentMonth(month) ? upcoming(30) : Promise.resolve([]), isCurrentMonth(month) ? pendingFixedThisMonth() : Promise.resolve({ total: 0, items: [] })]);
  const avgTotal = [...avg.values()].reduce((a, b) => a + b, 0);
  const balance = totals.income - totals.expense;
  const checking = accounts.filter((a) => a.kind === 'checking' && a.balance !== null);
  const checkingTotal = checking.reduce((a, c) => a + (c.balance ?? 0), 0);
  const invested = allocation.reduce((a, s) => a + s.balance, 0);

  // fatura "aberta" de cada cartão: a que fecha neste mês ou no próximo
  const cards = accounts.filter((a) => a.kind === 'credit_card' && a.closing_day && a.due_day);
  const openInvoices = cards.map((card) => {
    const m = openInvoiceMonth(card.closing_day!);
    const inv = invoices.find((i) => i.account_id === card.id && i.invoice_month === m);
    const { closes, due } = invoiceDates(m, card.closing_day!, card.due_day!);
    return { card, month: m, total: inv?.total ?? 0, closes, due };
  });
  const openTotal = openInvoices.reduce((a, i) => a + i.total, 0);
  const committed = commitments.reduce((a, c) => a + c.total, 0);

  // livre pra gastar: limite dos grupos de gasto menos o que já foi (e o que está fora dos grupos)
  const isCurrent = month === currentMonth();
  const daysInMonth = Number(monthEnd(month).slice(8, 10));
  const daysLeft = isCurrent ? daysInMonth - todayDay() + 1 : 0;
  const spendGroups = budget.groups.filter((g) => g.group.basis !== 'investment' && g.limit > 0);
  const limitSum = spendGroups.reduce((a, g) => a + g.limit, 0);
  const spentInGroups = spendGroups.reduce((a, g) => a + g.spent, 0) + budget.unassigned.spent;
  const hasBudget = limitSum > 0;
  // fixos que ainda vão cair neste mês já estão "gastos" na prática
  const free = (hasBudget ? limitSum - spentInGroups : balance) - fixedPending.total;
  const fixedNote = fixedPending.total ? ` · ${formatBRL(fixedPending.total, { cents: false })} de fixos a cair` : '';
  const freeHint = !hasBudget
    ? `sem orçamento configurado${fixedNote}`
    : free < 0
      ? `passou ${formatBRL(-free, { cents: false })} do teto de ${formatBRL(limitSum, { cents: false })}${fixedNote}`
      : isCurrent && daysLeft > 0
        ? `${formatBRL(free / daysLeft, { cents: false })}/dia por ${daysLeft} dia${daysLeft > 1 ? 's' : ''}${fixedNote}`
        : `de um teto de ${formatBRL(limitSum, { cents: false })}`;
  const projected = isCurrent && todayDay() > 0 ? (totals.expense / todayDay()) * daysInMonth : null;
  const invoiceHint = openInvoices.length === 0
    ? 'nenhum cartão'
    : checking.length
      ? (checkingTotal - openTotal >= 0 ? `saldo cobre, sobram ${formatBRL(checkingTotal - openTotal, { cents: false })}` : `faltam ${formatBRL(openTotal - checkingTotal, { cents: false })} na conta`)
      : openInvoices.length === 1 ? `vence ${formatDate(openInvoices[0].due).slice(0, 5)}` : `${openInvoices.length} cartões`;
  const { rows: pendingRows } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM transactions WHERE reviewed = FALSE`);
  const pendingCount = pendingRows[0]?.n ?? 0;

  const top = byCat.slice(0, 8);
  const rest = byCat.slice(8);
  const barItems = top.map((c) => ({
    label: `${c.icon ?? ''} ${c.name}`.trim(),
    value: c.total,
    marker: avg.get(c.category_id) ?? null,
    hint: `${c.count}`,
    href: c.category_id ? `/transacoes?m=${month}&c=${c.category_id}` : `/transacoes?m=${month}`,
  }));
  if (rest.length) barItems.push({ label: rest.length === 1 ? `${rest[0].icon ?? ''} ${rest[0].name}`.trim() : `Outras ${rest.length}`, value: rest.reduce((a, c) => a + c.total, 0), marker: null, hint: `${rest.reduce((a, c) => a + c.count, 0)}`, href: `/transacoes?m=${month}` });
  const restMobile = byCat.slice(5);
  const barItemsMobile = barItems.slice(0, 5);
  if (restMobile.length) barItemsMobile.push({ label: restMobile.length === 1 ? `${restMobile[0].icon ?? ''} ${restMobile[0].name}`.trim() : `Outras ${restMobile.length}`, value: restMobile.reduce((a, c) => a + c.total, 0), marker: null, hint: `${restMobile.reduce((a, c) => a + c.count, 0)}`, href: `/transacoes?m=${month}` });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-ink-2">{month === currentMonth() ? 'Onde o dinheiro está indo neste mês.' : `Como foi ${formatMonth(month, true).toLowerCase()}.`}</p>
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

      <section className="order-1 lg:order-none grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={isCurrent ? 'Livre pra gastar' : 'Sobrou do teto'} value={free} tone={free < 0 ? 'bad' : 'good'} hint={freeHint} />
        <StatTile label="Gasto no mês" value={totals.expense} delta={avgTotal ? { pct: (totals.expense - avgTotal) / avgTotal } : null} hint={projected && avgTotal ? `projeção ${formatBRL(projected, { cents: false })} · média ${formatBRL(avgTotal, { cents: false })}` : projected ? `projeção ${formatBRL(projected, { cents: false })}` : avgTotal ? `média ${formatBRL(avgTotal, { cents: false })}` : `${totals.expenseCount} lançamentos`} />
        <StatTile label="Sobrou" value={balance} tone={balance < 0 ? 'bad' : undefined} hint={totals.income ? `receita ${formatBRL(totals.income, { cents: false })} · ${Math.round((balance / totals.income) * 100)}%` : 'sem receita registrada'} />
        <StatTile label="Faturas abertas" value={openTotal} tone={checking.length && checkingTotal - openTotal < 0 ? 'bad' : undefined} hint={invoiceHint} />
      </section>

      {tripStatuses.length ? (
        <section className={`${tripStatuses.some((s) => s.phase === 'active') ? 'order-2' : 'order-9'} lg:order-none card p-4 flex flex-col gap-4`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Viagem</h2>
            <Link href="/viagens" className="text-[13px] text-accent tap">ver</Link>
          </div>
          {tripStatuses.map((s) => <TripCard key={s.trip.id} s={s} />)}
        </section>
      ) : null}

      {next30.length ? (
        <section className="order-3 lg:order-none card p-4 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Próximos 30 dias</h2>
            <span className="text-[13px] text-ink-2">{formatBRL(next30.reduce((a, u) => a + u.amount, 0), { cents: false })} saem</span>
          </div>
          <ul className="divide-y divide-border text-[13px]">
            {next30.map((u, i) => {
              const d = daysUntil(u.date);
              return (
                <li key={i} className="py-1.5 flex items-center gap-3">
                  <span className="w-12 shrink-0 text-ink-3">{formatDate(u.date).slice(0, 5)}</span>
                  <Link href={u.href} className="flex-1 min-w-0 truncate hover:underline">{u.label}</Link>
                  <span className={`shrink-0 text-[11px] ${d <= 3 ? 'text-warn' : 'text-ink-3'}`}>{d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`}</span>
                  <span className="shrink-0 font-medium">{formatBRL(u.amount, { cents: false })}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="order-3 lg:hidden card p-4 flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Últimos lançamentos</h2>
          <Link href={`/transacoes?m=${month}`} className="text-[13px] text-accent tap">ver todos</Link>
        </div>
        <TxList items={recent.slice(0, 5)} categories={categories} />
      </section>

      <section id="orcamento" className="order-4 lg:order-none card p-4 flex flex-col gap-3 scroll-mt-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Orçamento <span className="text-ink-3 font-normal text-[13px] hidden sm:inline">por percentual da renda</span></h2>
          <Link href="/config#orcamento" className="text-[13px] text-accent tap">configurar</Link>
        </div>
        <div className="lg:hidden"><BudgetBars status={budget} compact /></div>
        <div className="hidden lg:block"><BudgetBars status={budget} /></div>
      </section>

      {insights.length || pendingCount ? (
        <section className="order-5 lg:order-none card p-4 flex flex-col gap-2">
          <h2 className="font-semibold">Destaques</h2>
          <ul className="flex flex-col divide-y divide-border">
            {pendingCount ? (
              <li className="py-2 flex items-start gap-2.5 text-[13px]">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-warn shrink-0" aria-hidden />
                <span><span className="font-medium">{pendingCount} lançamento{pendingCount > 1 ? 's' : ''} do extrato sem categoria.</span> <Link href="/revisar" className="text-accent">Revisar</Link></span>
              </li>
            ) : null}
            {insights.map((i, idx) => (
              <li key={idx} className="py-2 flex items-start gap-2.5 text-[13px]">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${i.tone === 'good' ? 'bg-good' : i.tone === 'warning' ? 'bg-warn' : 'bg-ink-3'}`} aria-hidden />
                <span><span className="font-medium">{i.icon ? `${i.icon} ` : ''}{i.title}.</span> <span className="text-ink-2">{i.detail}</span></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="order-6 lg:order-none grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-2 flex flex-col gap-3 min-w-0">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Por categoria</h2>
            <Link href={`/transacoes?m=${month}`} className="text-[13px] text-accent tap">ver tudo</Link>
          </div>
          <div className="lg:hidden"><BarList items={barItemsMobile} markerLabel="média dos últimos 3 meses" /></div>
          <div className="hidden lg:block"><BarList items={barItems} markerLabel="média dos últimos 3 meses" /></div>
        </div>
        <div className="card p-4 lg:col-span-3 flex flex-col gap-3 min-w-0">
          <h2 className="font-semibold">Ritmo do mês <span className="text-ink-3 font-normal text-[13px]">gasto acumulado por dia</span></h2>
          <CumulativeChart data={daily} currentLabel={formatMonth(month)} previousLabel={formatMonth(prevMonth)} />
        </div>
      </section>

      <section className="order-7 lg:order-none grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-4 lg:col-span-3 flex flex-col gap-3 min-w-0">
          <h2 className="font-semibold"><span className="md:hidden">Últimos 6 meses</span><span className="hidden md:inline">Últimos 12 meses</span></h2>
          <div className="md:hidden"><MonthlyChart data={series.slice(-6)} /></div>
          <div className="hidden md:block"><MonthlyChart data={series} /></div>
        </div>
        <div className="card p-4 lg:col-span-2 flex flex-col gap-3 min-w-0">
          <h2 className="font-semibold">Saldos</h2>
          <dl className="flex flex-col divide-y divide-border text-[14px]">
            {checking.map((c) => (
              <div key={c.id} className="flex justify-between py-2"><dt className="text-ink-2">{c.name} <span className="text-ink-3 text-[12px]">em {formatDate(c.balance_at!).slice(0, 5)}</span></dt><dd className="tabular font-medium">{formatBRL(c.balance)}</dd></div>
            ))}
            {checking.length > 1 ? <div className="flex justify-between py-2"><dt className="text-ink-2">Em conta</dt><dd className="font-semibold">{formatBRL(checkingTotal)}</dd></div> : null}
            {checking.length && openInvoices.length ? (
              <>
                <div className="flex justify-between py-2"><dt className="text-ink-2">Fatura aberta <span className="text-ink-3 text-[12px]">vence {formatDate([...openInvoices].sort((a, b) => a.due.localeCompare(b.due))[0].due).slice(0, 5)}</span></dt><dd className="text-ink-2">−{formatBRL(openTotal)}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-ink-2">Livre após a fatura</dt><dd className={`font-semibold ${checkingTotal - openTotal < 0 ? 'text-bad' : ''}`}>{formatBRL(checkingTotal - openTotal)}</dd></div>
              </>
            ) : null}
            <div className="flex justify-between py-2"><dt className="text-ink-2">Investido</dt><dd className="font-semibold">{invested ? formatBRL(invested) : <Link href="/investimentos" className="text-accent text-[13px]">registrar</Link>}</dd></div>
            <div className="flex justify-between py-2">
              <dt className="text-ink-2">Parcelas a vencer{commitments.length ? <span className="text-ink-3 text-[12px]"> {formatMonth(commitments[0].month)}{commitments.length > 1 ? ` a ${formatMonth(commitments[commitments.length - 1].month)}` : ''} · {commitments.reduce((a, c) => a + c.count, 0)} parcelas</span> : null}</dt>
              <dd className={`font-semibold ${committed ? 'text-warn' : ''}`}><Link href="/faturas">{formatBRL(committed)}</Link></dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="hidden lg:flex card p-4 flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Últimos lançamentos</h2>
          <Link href={`/transacoes?m=${month}`} className="text-[13px] text-accent tap">ver todos</Link>
        </div>
        <TxList items={recent} categories={categories} />
      </section>
    </div>
  );
}
