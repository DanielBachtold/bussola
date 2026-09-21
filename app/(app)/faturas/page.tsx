import Link from 'next/link';
import { addMonths, formatDate, formatMonth, invoiceDates, openInvoiceMonth } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { futureCommitments, invoiceSummaries, listAccounts, listCategories, listTransactions } from '@/lib/queries';
import { TxList } from '@/components/TxList';
import { intParam, monthParam } from '@/lib/params';
import { ScrollStrip } from '@/components/ScrollIntoView';

export const metadata = { title: 'Faturas' };

import { requireSession } from '@/lib/session';

export default async function FaturasPage({ searchParams }: PageProps<'/faturas'>) {
  await requireSession();
  const sp = await searchParams;
  const accounts = (await listAccounts()).filter((a) => a.kind === 'credit_card');
  const categories = await listCategories();
  if (!accounts.length) {
    return (
      <div className="card p-5 flex flex-col gap-2 max-w-xl">
        <h1 className="text-[22px] font-semibold tracking-tight">Faturas</h1>
        <p className="text-sm text-ink-2">Cadastre um cartão de crédito com dia de fechamento e vencimento para ver as faturas aqui.</p>
        <Link href="/config" className="btn btn-primary self-start">Cadastrar cartão</Link>
      </div>
    );
  }
  const cardId = intParam(sp.cartao) ?? accounts[0].id;
  const card = accounts.find((a) => a.id === cardId) ?? accounts[0];
  const openMonth = openInvoiceMonth(card.closing_day ?? 31);
  const month = monthParam(sp.m) ?? openMonth;

  const [summaries, items, commitments] = await Promise.all([
    invoiceSummaries(card.id), listTransactions({ accountId: card.id, invoiceMonth: month, limit: 1000 }), futureCommitments(),
  ]);
  const total = items.filter((t) => t.kind === 'expense').reduce((a, t) => a + Math.abs(t.amount), 0);
  const payments = items.filter((t) => t.kind !== 'expense').reduce((a, t) => a + t.amount, 0);
  const { closes, due } = invoiceDates(month, card.closing_day!, card.due_day!);
  const status = month < openMonth ? 'fechada' : month === openMonth ? 'aberta' : 'futura';
  const installmentsHere = items.filter((t) => t.installment_group).length;

  // últimas 6 faturas + as futuras que já têm parcela
  const months = Array.from(new Set([
    ...Array.from({ length: 6 }, (_, i) => addMonths(openMonth, -5 + i)),
    ...summaries.map((s) => s.invoice_month),
  ])).sort();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Faturas</h1>
          <p className="text-sm text-ink-2">Fecha dia {card.closing_day}, vence dia {card.due_day}.</p>
        </div>
        {accounts.length > 1 ? (
          <div className="flex gap-1">
            {accounts.map((a) => <Link key={a.id} href={`/faturas?cartao=${a.id}`} className={`btn btn-sm ${a.id === card.id ? 'btn-primary' : 'btn-ghost'}`}>{a.name}</Link>)}
          </div>
        ) : null}
      </header>

      <ScrollStrip className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
        {months.map((m) => {
          const s = summaries.find((x) => x.invoice_month === m);
          const active = m === month;
          return (
            <Link key={m} href={`/faturas?cartao=${card.id}&m=${m}`} data-active={active} className={`card shrink-0 px-3 py-2 min-w-[110px] ${active ? '!border-accent' : ''}`}>
              <span className="block text-[12px] text-ink-3 capitalize">{formatMonth(m)}{m === openMonth ? ' · aberta' : ''}</span>
              <span className="block tabular font-semibold text-[15px]">{formatBRL(s?.total ?? 0)}</span>
            </Link>
          );
        })}
      </ScrollStrip>

      <section className="grid md:grid-cols-3 gap-3">
        <div className="card p-4">
          <span className="text-[12px] uppercase tracking-wide text-ink-3 font-medium">Fatura {formatMonth(month)} · {status}</span>
          <span className="block text-[28px] font-semibold">{formatBRL(total)}</span>
          <span className="text-[12px] text-ink-2">{items.filter((t) => t.kind === 'expense').length} compras{installmentsHere ? `, ${installmentsHere} parcelas` : ''}</span>
        </div>
        <div className="card p-4">
          <span className="text-[12px] uppercase tracking-wide text-ink-3 font-medium">Fechamento</span>
          <span className="block text-[22px] font-semibold">{formatDate(closes)}</span>
          <span className="text-[12px] text-ink-2">vence em {formatDate(due)}</span>
        </div>
        <div className="card p-4">
          <span className="text-[12px] uppercase tracking-wide text-ink-3 font-medium">Comprometido adiante</span>
          <span className="block text-[22px] font-semibold text-warn">{formatBRL(commitments.reduce((a, c) => a + c.total, 0))}</span>
          <span className="text-[12px] text-ink-2">{commitments.length ? `parcelas até ${formatMonth(commitments[commitments.length - 1].month)}` : 'nenhuma parcela futura'}</span>
        </div>
      </section>

      {payments ? <p className="text-[13px] text-ink-3">Pagamentos e estornos nesta fatura: {formatBRL(payments)} (não contam como gasto).</p> : null}

      <section className="card px-4 py-2">
        <TxList items={items} categories={categories} emptyText="Nenhuma compra nesta fatura." />
      </section>
    </div>
  );
}
