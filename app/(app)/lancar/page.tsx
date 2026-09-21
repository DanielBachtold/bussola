import { pool } from '@/lib/db';
import { frequentDescriptions, listAccounts, listCategories, listTransactions } from '@/lib/queries';
import { listRules } from '@/lib/rules';
import { currentMonth } from '@/lib/dates';
import { QuickAdd } from '@/components/QuickAdd';
import { TxList } from '@/components/TxList';
import { FullForm } from './FullForm';
import { listTrips } from '@/lib/trips';
import { requireSession } from '@/lib/session';
import { postRecurring } from '@/lib/recurring';
import { Help } from './Help';

export const metadata = { title: 'Lançar' };

export default async function LancarPage({ searchParams }: PageProps<'/lancar'>) {
  await requireSession();
  await postRecurring().catch(() => 0);
  const sp = await searchParams;
  // ?q= vem do atalho da Siri ou do "compartilhar" da notificação do banco; ok=1 lança sem confirmar
  const initialText = typeof sp.q === 'string' ? sp.q.slice(0, 200) : '';
  const autoSubmit = sp.ok === '1' && Boolean(initialText);
  const [accounts, categories, rules, recent, trips, frequent] = await Promise.all([
    listAccounts(), listCategories(), listRules(pool), listTransactions({ month: currentMonth(), status: 'pending', limit: 20 }), listTrips(), frequentDescriptions(),
  ]);
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Lançar</h1>
          <p className="text-sm text-ink-2 hidden md:block">Escreva como você falaria: valor, onde, em que conta. Eu entendo o resto.</p>
        </div>
        <Help />
      </header>
      <QuickAdd accounts={accounts} categories={categories} rules={rules} trips={trips} frequent={frequent} initialText={initialText} autoSubmit={autoSubmit} />
      <details className="group">
        <summary className="cursor-pointer text-[13px] text-accent w-fit">Formulário completo</summary>
        <div className="card p-4 mt-2"><FullForm accounts={accounts} categories={categories} trips={trips} /></div>
      </details>
      <section className="card p-4 flex flex-col gap-2">
        <h2 className="font-semibold">Ainda sem extrato <span className="text-ink-3 font-normal text-[13px]">lançados neste mês</span></h2>
        <TxList items={recent} categories={categories} trips={trips} hideStatus emptyText="Nada pendente. Quando o extrato entrar, o que você lançou aqui é conciliado sozinho." />
      </section>
    </div>
  );
}
