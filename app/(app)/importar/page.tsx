import { pool } from '@/lib/db';
import { listAccounts } from '@/lib/queries';
import { formatDate } from '@/lib/dates';
import { ImportForm } from './ImportForm';
import { UndoImport } from './UndoImport';

export const metadata = { title: 'Importar extrato' };

import { requireSession } from '@/lib/session';

export default async function ImportarPage() {
  await requireSession();
  const accounts = (await listAccounts()).filter((a) => a.kind !== 'investment');
  const { rows: history } = await pool.query<{ id: number; account_id: number; filename: string; account_name: string; period_start: string | null; period_end: string | null; matched: number; inserted: number; skipped: number; created_at: string; latest: boolean }>(
    `SELECT i.*, a.name AS account_name,
            i.id = MAX(i.id) OVER (PARTITION BY i.account_id)
              AND EXISTS (SELECT 1 FROM transactions t WHERE t.import_id = i.id OR t.reconciled_import_id = i.id) AS latest
     FROM imports i JOIN accounts a ON a.id = i.account_id ORDER BY i.id DESC LIMIT 12`,
  );
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Importar extrato</h1>
        <p className="text-sm text-ink-2">OFX é o formato ideal: cada linha vem com identificador único, então reimportar o mesmo arquivo não duplica nada. CSV e PDF também funcionam (no PDF eu leio o texto e monto as linhas, então confira a prévia antes de confirmar).</p>
      </header>
      <ImportForm accounts={accounts} defaultAccountId={history[0]?.account_id} />
      {history.length ? (
        <section className="card p-4">
          <h2 className="font-semibold mb-2">Importações anteriores</h2>
          <ul className="text-[13px] divide-y divide-border">
            {history.map((h) => (
              <li key={h.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span><span className="font-medium">{h.account_name}</span> <span className="text-ink-3">{h.filename}</span></span>
                <span className="text-ink-2 flex items-center gap-2">
                  {h.period_start ? `${formatDate(h.period_start)} a ${formatDate(h.period_end ?? h.period_start)}` : ''} · {h.matched} conciliados · {h.inserted} novos · {h.skipped} repetidos
                  {h.latest ? <UndoImport importId={h.id} filename={h.filename} /> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
