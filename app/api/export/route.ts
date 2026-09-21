import { pool } from '@/lib/db';
import { sessionOrNull } from '@/lib/session';
import { listTransactions } from '@/lib/queries';
import { todayISO } from '@/lib/dates';

/**
 * GET /api/export?format=csv   -> lançamentos em CSV (Excel/Sheets)
 * GET /api/export?format=json  -> backup completo (todas as tabelas)
 */
export async function GET(req: Request) {
  if (!(await sessionOrNull())) return new Response('Unauthorized', { status: 401 });
  const format = new URL(req.url).searchParams.get('format') ?? 'csv';
  const stamp = todayISO();

  if (format === 'json') {
    const tables = ['accounts', 'categories', 'category_rules', 'budget_groups', 'settings', 'trips', 'recurring_rules', 'investment_snapshots', 'imports', 'transactions'];
    const dump: Record<string, unknown[]> = {};
    for (const t of tables) dump[t] = (await pool.query(`SELECT * FROM ${t} ORDER BY 1`)).rows;
    return new Response(JSON.stringify({ exported_at: new Date().toISOString(), ...dump }, null, 1), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="bussola-backup-${stamp}.json"` },
    });
  }

  const rows = await listTransactions({ limit: 2000, offset: 0 });
  // além das 2000 primeiras, pagina até acabar
  let offset = 2000;
  while (true) {
    const more = await listTransactions({ limit: 2000, offset });
    if (!more.length) break;
    rows.push(...more);
    offset += 2000;
  }
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['data', 'descricao', 'valor', 'tipo', 'conta', 'categoria', 'situacao', 'fatura', 'viagem', 'parcela', 'observacao', 'descricao_extrato'];
  const lines = rows.map((t) => [
    t.date, t.description, String(t.amount).replace('.', ','), t.kind, t.account_name, t.category_name ?? '', t.status,
    t.invoice_month?.slice(0, 7) ?? '', t.trip_name ?? '', t.installment_total ? `${t.installment_n}/${t.installment_total}` : '', t.notes ?? '', t.statement_description ?? '',
  ].map(esc).join(';'));
  const csv = '﻿' + [header.join(';'), ...lines].join('\r\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bussola-lancamentos-${stamp}.csv"` } });
}
