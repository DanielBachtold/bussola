import Link from 'next/link';
import { listTrips, tripStatus } from '@/lib/trips';
import { listAccounts, listCategories } from '@/lib/queries';
import { formatBRL } from '@/lib/money';
import { formatDate, todayISO } from '@/lib/dates';
import { TripCard } from '@/components/TripCard';
import { TxList } from '@/components/TxList';
import { PrepaidForm, TripForm, TripActions } from './TripForms';
import { intParam } from '@/lib/params';

export const metadata = { title: 'Viagens' };

import { requireSession } from '@/lib/session';

export default async function ViagensPage({ searchParams }: PageProps<'/viagens'>) {
  await requireSession();
  const sp = await searchParams;
  const [trips, accounts, categories] = await Promise.all([listTrips(), listAccounts(), listCategories()]);
  const selectedId = intParam(sp.v) ?? (trips.find((t) => t.start_date <= todayISO() && t.end_date >= todayISO())?.id || trips[0]?.id);
  const selected = trips.find((t) => t.id === selectedId) ?? null;
  const status = selected ? await tripStatus(selected) : null;
  const creating = sp.nova === '1' || !trips.length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Viagens</h1>
          <p className="text-sm text-ink-2">Um período com teto próprio. O que você gastar nas datas da viagem entra aqui e sai dos grupos do orçamento mensal; as contas fixas seguem no mês.</p>
        </div>
        {trips.length ? <Link href="/viagens?nova=1" className="btn btn-primary btn-sm">Nova viagem</Link> : null}
      </header>

      {creating ? (
        <section className="card p-4 flex flex-col gap-3 max-w-2xl">
          <h2 className="font-semibold">{trips.length ? 'Nova viagem' : 'Cadastre sua primeira viagem'}</h2>
          <TripForm trip={null} />
        </section>
      ) : null}

      {trips.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
          {trips.map((t) => (
            <Link key={t.id} href={`/viagens?v=${t.id}`} className={`card shrink-0 px-3 py-2 min-w-[140px] ${t.id === selected?.id ? '!border-accent' : ''}`}>
              <span className="block text-[13px] font-medium truncate">{t.name}</span>
              <span className="block text-[11px] text-ink-3">{formatDate(t.start_date).slice(0, 5)} a {formatDate(t.end_date).slice(0, 5)} · teto {formatBRL(t.budget)}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {selected && status ? (
        <>
          <section className="card p-4 flex flex-col gap-3">
            <TripCard s={status} />
            {selected.notes ? <p className="text-[13px] text-ink-2 whitespace-pre-wrap">{selected.notes}</p> : null}
            <TripActions key={selected.id} trip={selected} />
          </section>

          <section className="grid lg:grid-cols-5 gap-4">
            <div className="card p-4 lg:col-span-3 flex flex-col gap-2">
              <h2 className="font-semibold">Gastos da viagem <span className="text-ink-3 font-normal text-[13px]">dentro do teto</span></h2>
              <TxList items={status.expenses} categories={categories} trips={trips} emptyText="Nada ainda. Gastos lançados nas datas da viagem (fora as categorias fixas) aparecem aqui sozinhos." />
            </div>
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="card p-4 flex flex-col gap-2">
                <h2 className="font-semibold">Pré-pago <span className="text-ink-3 font-normal text-[13px]">fora do teto</span></h2>
                <p className="text-[12px] text-ink-3">Passagem, hospedagem paga antes, pacote. Conta como gasto do mês em que foi pago, mas não no teto da viagem.</p>
                <TxList items={status.prepaidItems} categories={categories} trips={trips} compact emptyText="Nenhum item pré-pago." />
                <details className="mt-1">
                  <summary className="cursor-pointer text-[13px] text-accent">Registrar item pré-pago</summary>
                  <div className="mt-2"><PrepaidForm key={selected.id} tripId={selected.id} accounts={accounts} categories={categories} /></div>
                </details>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
