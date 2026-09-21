import { listCategories, pendingReview } from '@/lib/queries';
import { formatBRL } from '@/lib/money';
import { TxList } from '@/components/TxList';
import { UnmatchedList } from './UnmatchedList';
import { listTrips } from '@/lib/trips';

export const metadata = { title: 'Revisar' };

export default async function RevisarPage() {
  const [{ unreviewed, unmatched }, categories, trips] = await Promise.all([pendingReview(), listCategories(), listTrips()]);
  const total = unreviewed.filter((t) => t.kind === 'expense').reduce((a, t) => a + Math.abs(t.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Revisar</h1>
        <p className="text-sm text-ink-2">O que veio no extrato e você não tinha registrado, e o que você registrou e não apareceu no extrato.</p>
      </header>

      <section className="card p-4 flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Veio no extrato, faltou registrar <span className="pill pill-warn ml-1">{unreviewed.length}</span></h2>
          <span className="text-[13px] text-ink-2 tabular">{formatBRL(total)}</span>
        </div>
        <p className="text-[13px] text-ink-3">Toque em cada linha, confirme a categoria (ou marque como transferência). Com &ldquo;aprender esse padrão&rdquo; ligado, da próxima vez o sistema categoriza sozinho.</p>
        <TxList items={unreviewed} categories={categories} trips={trips} emptyText="Tudo revisado." />
      </section>

      <section className="card p-4 flex flex-col gap-2">
        <h2 className="font-semibold">Você registrou, não apareceu no extrato <span className="pill ml-1">{unmatched.length}</span></h2>
        <p className="text-[13px] text-ink-3">Pode ser erro de digitação, compra em outra conta, ou algo que ainda vai cair. Confirme ou corrija.</p>
        <UnmatchedList items={unmatched} categories={categories} />
      </section>
    </div>
  );
}
