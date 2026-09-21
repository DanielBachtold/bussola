import { currentMonth, monthEnd, monthStart } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { listAccounts, listCategories, listTransactions } from '@/lib/queries';
import type { TxKind } from '@/lib/types';
import { MonthNav } from '@/components/MonthNav';
import { TxList } from '@/components/TxList';
import { Filters } from './Filters';
import { listTrips } from '@/lib/trips';

export const metadata = { title: 'Extrato' };

export default async function TransacoesPage({ searchParams }: PageProps<'/transacoes'>) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : '');
  const month = /^\d{4}-\d{2}$/.test(str('m')) ? str('m') : currentMonth();
  const accountId = Number(str('a')) || undefined;
  const categoryId = Number(str('c')) || undefined;
  const kind = (['expense', 'income', 'transfer'].includes(str('k')) ? str('k') : undefined) as TxKind | undefined;
  const search = str('q') || undefined;

  const [items, accounts, categories, trips] = await Promise.all([
    listTransactions({ start: monthStart(month), end: monthEnd(month), accountId, categoryId, kind, search, limit: 1000 }),
    listAccounts(), listCategories(), listTrips(),
  ]);
  const expense = items.filter((t) => t.kind === 'expense').reduce((a, t) => a + Math.abs(t.amount), 0);
  const income = items.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amount, 0);
  const extra = [accountId ? `&a=${accountId}` : '', categoryId ? `&c=${categoryId}` : '', kind ? `&k=${kind}` : '', search ? `&q=${encodeURIComponent(search)}` : ''].join('');

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Extrato</h1>
          <p className="text-sm text-ink-2">{items.length} lançamentos · gasto {formatBRL(expense)} · receita {formatBRL(income)}</p>
        </div>
        <MonthNav month={month} basePath="/transacoes" extra={extra} />
      </header>
      <Filters accounts={accounts} categories={categories} month={month} values={{ a: accountId, c: categoryId, k: kind, q: search }} />
      <section className="card px-4 py-2">
        <TxList items={items} categories={categories} trips={trips} />
      </section>
    </div>
  );
}
