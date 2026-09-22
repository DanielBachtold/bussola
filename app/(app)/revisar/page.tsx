import { listCategories, pendingReview, topCategoriesByAccount } from '@/lib/queries';
import { formatBRL } from '@/lib/money';
import { TxList } from '@/components/TxList';
import { UnmatchedList } from './UnmatchedList';
import { listTrips } from '@/lib/trips';
import { listRules } from '@/lib/rules';
import { pool } from '@/lib/db';
import { MarkAllButton } from './MarkAll';
import { TransferCheck } from './TransferCheck';
import { counterpartySuggestions, transferCandidates } from '@/lib/transfers';
import { WhoAmI } from './WhoAmI';
import { getSetting } from '@/lib/budget';

export const metadata = { title: 'Revisar' };

import { requireSession } from '@/lib/session';
import { postRecurring } from '@/lib/recurring';

export default async function RevisarPage() {
  await requireSession();
  await postRecurring().catch(() => 0);
  const [{ unreviewed, unmatched, total }, categories, trips, rules, topByAccount, candidates, dismissedRaw] = await Promise.all([
    pendingReview(), listCategories(), listTrips(), listRules(pool), topCategoriesByAccount(3), transferCandidates(12), getSetting('transfer_dismissed'),
  ]);
  const myNames = await getSetting('my_names');
  const nameSuggestions = myNames ? [] : await counterpartySuggestions();
  const dismissed: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : [];
  const transfers = candidates.filter((c) => !dismissed.includes(c.key));
  const sum = unreviewed.filter((t) => t.kind === 'expense').reduce((a, t) => a + Math.abs(t.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Revisar</h1>
        <p className="text-sm text-ink-2 hidden md:block">O que o extrato trouxe e ainda precisa de um toque seu.</p>
      </header>

      <WhoAmI suggestions={nameSuggestions} />
      <TransferCheck candidates={transfers} />

      <section className="card p-4 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
          <h2 className="font-semibold">Veio no extrato, faltou categorizar <span className="pill pill-warn ml-1">{total > unreviewed.length ? `${unreviewed.length} de ${total}` : total}</span></h2>
          <span className="text-[13px] text-ink-2">{formatBRL(sum)}</span>
        </div>
        <p className="text-[13px] text-ink-3 hidden md:block">Um toque no chip categoriza e ensina o padrão; os iguais na fila vão junto.</p>
        <TxList items={unreviewed} categories={categories} trips={trips} hideStatus review={{ rules, topByAccount }} emptyText="Tudo revisado." />
        {unreviewed.length > 1 ? <div className="flex justify-end pt-1"><MarkAllButton count={total} /></div> : null}
      </section>

      <section className="card p-4 flex flex-col gap-2">
        <h2 className="font-semibold">Você registrou, não apareceu no extrato <span className="pill ml-1">{unmatched.length}</span></h2>
        <p className="text-[13px] text-ink-3 hidden md:block">Erro de digitação, compra em outra conta, ou algo que ainda vai cair.</p>
        <UnmatchedList items={unmatched} categories={categories} />
      </section>
    </div>
  );
}
