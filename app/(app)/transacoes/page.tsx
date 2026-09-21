import Link from 'next/link';
import { currentMonth, formatMonth, monthEnd, monthStart } from '@/lib/dates';
import { formatBRL, parseAmount } from '@/lib/money';
import { listAccounts, listCategories, pageTransactions } from '@/lib/queries';
import type { TxKind } from '@/lib/types';
import { MonthNav } from '@/components/MonthNav';
import { TxList } from '@/components/TxList';
import { Filters } from './Filters';
import { listTrips } from '@/lib/trips';
import { intParam, monthParam } from '@/lib/params';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Lançamentos' };

const PAGE = 200;

export default async function TransacoesPage({ searchParams }: PageProps<'/transacoes'>) {
  await requireSession();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const search = str('q').trim() || undefined;
  // com busca (ou m=all) o período é o histórico inteiro
  const allTime = str('m') === 'all' || Boolean(search);
  const month = monthParam(str('m')) ?? currentMonth();
  const accountId = intParam(str('a'));
  const categoryId = str('c') === 'none' ? 'none' as const : intParam(str('c'));
  const kind = (['expense', 'income', 'transfer'].includes(str('k')) ? str('k') : undefined) as TxKind | undefined;
  const situation = ['revisar', 'sem-extrato', 'conciliado'].includes(str('s')) ? str('s') : undefined;
  const tripId = intParam(str('v'));
  const offset = intParam(str('o')) ?? 0;
  // "249,90" procura pelo valor exato, não pelo texto
  const amount = search && /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(search) ? Math.abs(parseAmount(search)) : undefined;

  const [page, accounts, categories, trips] = await Promise.all([
    pageTransactions({
      start: allTime ? undefined : monthStart(month), end: allTime ? undefined : monthEnd(month),
      accountId, categoryId, kind, search: amount === undefined ? search : undefined, amount, tripId,
      reviewed: situation === 'revisar' ? false : undefined,
      status: situation === 'sem-extrato' ? 'pending' : situation === 'conciliado' ? 'reconciled' : undefined,
      limit: PAGE, offset,
    }),
    listAccounts(), listCategories(), listTrips(),
  ]);

  const hasFilter = Boolean(accountId || categoryId || kind || situation || tripId || search);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ m: allTime ? 'all' : month, a: accountId, c: categoryId, k: kind, s: situation, v: tripId, q: search })) if (v) qs.set(k, String(v));
  const extra = ['a', 'c', 'k', 's', 'v', 'q'].filter((k) => qs.get(k)).map((k) => `&${k}=${encodeURIComponent(qs.get(k)!)}`).join('');
  const shown = offset + page.items.length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Lançamentos</h1>
          <p className="text-sm text-ink-2">
            {page.total} {allTime ? 'em todo o histórico' : `em ${formatMonth(month, true).toLowerCase()}`} · gasto {formatBRL(page.expense)} · receita {formatBRL(page.income)}
          </p>
        </div>
        {allTime ? <Link href={`/transacoes?m=${currentMonth()}`} className="btn btn-ghost btn-sm">Voltar ao mês</Link> : <MonthNav month={month} basePath="/transacoes" extra={extra} />}
      </header>
      <Filters
        key={qs.toString()}
        accounts={accounts} categories={categories} trips={trips} month={allTime ? 'all' : month}
        values={{ a: accountId, c: categoryId, k: kind, s: situation, v: tripId, q: search }}
      />
      <section className="card px-4 py-2">
        <TxList
          items={page.items} categories={categories} trips={trips} groupByDay
          emptyText={hasFilter ? 'Nada com esses filtros.' : `Nenhum lançamento em ${formatMonth(month, true).toLowerCase()}.`}
          emptyAction={hasFilter ? { label: 'Limpar filtros', href: `/transacoes?m=${allTime ? 'all' : month}` } : { label: 'Lançar agora', href: '/lancar' }}
        />
        {shown < page.total ? (
          <div className="flex justify-center py-3 hairline">
            <Link href={`/transacoes?${qs.toString()}&o=${shown}`} className="btn btn-ghost btn-sm">Carregar mais {Math.min(PAGE, page.total - shown)} de {page.total - shown}</Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
