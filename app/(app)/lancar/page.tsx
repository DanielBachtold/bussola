import { pool } from '@/lib/db';
import { listAccounts, listCategories, listTransactions } from '@/lib/queries';
import { listRules } from '@/lib/rules';
import { currentMonth } from '@/lib/dates';
import { QuickAdd } from '@/components/QuickAdd';
import { TxList } from '@/components/TxList';
import { FullForm } from './FullForm';
import { listTrips } from '@/lib/trips';

export const metadata = { title: 'Lançar' };

import { requireSession } from '@/lib/session';

export default async function LancarPage() {
  await requireSession();
  const [accounts, categories, rules, recent, trips] = await Promise.all([
    listAccounts(), listCategories(), listRules(pool), listTransactions({ month: currentMonth(), status: 'pending', limit: 20 }), listTrips(),
  ]);
  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Lançar</h1>
        <p className="text-sm text-ink-2">Escreva como você falaria. Exemplos: <em>mercado 350 em 3x rico</em>, <em>recebi 5000 salário nubank</em>, <em>ontem farmácia 89 débito</em>.</p>
      </header>
      <QuickAdd accounts={accounts} categories={categories} rules={rules} trips={trips} />
      <details className="card p-4">
        <summary className="cursor-pointer font-medium text-[14px]">Formulário completo</summary>
        <div className="mt-3"><FullForm accounts={accounts} categories={categories} trips={trips} /></div>
      </details>
      <section className="card p-4 flex flex-col gap-2">
        <h2 className="font-semibold">Lançados neste mês, aguardando extrato</h2>
        <TxList items={recent} categories={categories} trips={trips} compact emptyText="Nada pendente. Quando subir o extrato, o que você lançou aqui é conciliado automaticamente." />
      </section>
    </div>
  );
}
