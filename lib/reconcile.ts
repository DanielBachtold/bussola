import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction } from './db';
import { addMonths, daysBetween, invoiceMonthFor, monthStart } from './dates';
import { applyRules, listRules } from './rules';
import { createTransaction, getAccount } from './queries';
import type { ParsedStatement, StatementLine } from './statement';
import type { TxKind } from './types';

export type PreviewLine = StatementLine & {
  outcome: 'duplicate' | 'match' | 'new';
  matchId: number | null;
  matchDescription: string | null;
  categoryId: number | null;
  categoryName: string | null;
  kind: TxKind;
};

export type ImportPreview = {
  accountId: number;
  lines: PreviewLine[];
  counts: { duplicate: number; match: number; new: number };
};

const MATCH_WINDOW_DAYS = 4;

/**
 * Linhas sem FITID (CSV) ganham um identificador determinístico a partir de
 * data, valor e descrição, com um contador pra duas compras iguais no mesmo
 * dia. Assim reimportar o mesmo CSV não duplica nada.
 */
function withSyntheticIds(lines: StatementLine[]): StatementLine[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    if (l.fitid) return l;
    const base = `${l.date}|${l.amount.toFixed(2)}|${l.description.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const hash = createHash('sha1').update(base).digest('hex').slice(0, 16);
    return { ...l, fitid: `h:${hash}${n > 1 ? `#${n}` : ''}` };
  });
}

/**
 * Cruza o extrato com o que já existe na conta, sem gravar nada:
 * - fitid já importado  -> duplicate (ignora)
 * - lançamento manual pendente com mesmo valor e data próxima -> match
 * - nada parecido -> new (entra na fila de revisão)
 */
export async function previewImport(accountId: number, statement: ParsedStatement, invertSigns: boolean, db: PoolClient): Promise<ImportPreview> {
  const account = await getAccount(accountId, db);
  if (!account) throw new Error('Conta não encontrada.');
  const rules = await listRules(db);

  const lines = withSyntheticIds(statement.lines.map((l) => ({ ...l, amount: invertSigns ? -l.amount : l.amount })));
  const dates = lines.map((l) => l.date).sort();
  const start = dates[0], end = dates[dates.length - 1];

  const { rows: existingFit } = await db.query<{ fitid: string }>(
    `SELECT fitid FROM transactions WHERE account_id = $1 AND fitid IS NOT NULL`, [accountId],
  );
  const known = new Set(existingFit.map((r) => r.fitid));

  const { rows: pending } = await db.query<{ id: number; date: string; amount: number; description: string }>(
    `SELECT id, date, amount, description FROM transactions
     WHERE account_id = $1 AND status = 'pending' AND source IN ('manual','chat')
       AND date >= ($2::date - INTERVAL '${MATCH_WINDOW_DAYS} days') AND date <= ($3::date + INTERVAL '${MATCH_WINDOW_DAYS} days')
     ORDER BY date`,
    [accountId, start ?? '1970-01-01', end ?? '2999-12-31'],
  );
  const taken = new Set<number>();
  const { rows: cats } = await db.query<{ id: number; name: string }>(`SELECT id, name FROM categories`);
  const catName = (id: number | null) => cats.find((c) => c.id === id)?.name ?? null;

  const out: PreviewLine[] = [];
  const seenInFile = new Set<string>();
  for (const line of lines) {
    // já no banco, ou repetida dentro do próprio arquivo (o índice único derrubaria a importação)
    if (line.fitid && (known.has(line.fitid) || seenInFile.has(line.fitid))) {
      out.push({ ...line, outcome: 'duplicate', matchId: null, matchDescription: null, categoryId: null, categoryName: null, kind: 'expense' });
      continue;
    }
    if (line.fitid) seenInFile.add(line.fitid);
    // melhor candidato: mesmo valor, data mais próxima
    let best: (typeof pending)[number] | null = null;
    let bestDist = Infinity;
    for (const p of pending) {
      if (taken.has(p.id)) continue;
      if (Math.abs(Math.abs(p.amount) - Math.abs(line.amount)) > 0.005) continue;
      if (Math.sign(p.amount) !== Math.sign(line.amount)) continue;
      const dist = Math.abs(daysBetween(p.date, line.date));
      if (dist <= MATCH_WINDOW_DAYS && dist < bestDist) { best = p; bestDist = dist; }
    }
    if (best) {
      taken.add(best.id);
      out.push({ ...line, outcome: 'match', matchId: best.id, matchDescription: best.description, categoryId: null, categoryName: null, kind: line.amount < 0 ? 'expense' : 'income' });
      continue;
    }
    const applied = applyRules(line.description, rules);
    const kind: TxKind = applied.kind ?? (line.amount < 0 ? 'expense' : 'income');
    out.push({ ...line, outcome: 'new', matchId: null, matchDescription: null, categoryId: applied.category_id, categoryName: catName(applied.category_id), kind });
  }

  return {
    accountId,
    lines: out,
    counts: {
      duplicate: out.filter((l) => l.outcome === 'duplicate').length,
      match: out.filter((l) => l.outcome === 'match').length,
      new: out.filter((l) => l.outcome === 'new').length,
    },
  };
}

export type ImportResult = { importId: number; matched: number; inserted: number; skipped: number };

/** Grava o resultado do preview: concilia os matches e insere as linhas novas. */
export async function commitImport(accountId: number, filename: string, statement: ParsedStatement, invertSigns: boolean): Promise<ImportResult> {
  return withTransaction(async (db) => {
    const account = await getAccount(accountId, db);
    if (!account) throw new Error('Conta não encontrada.');
    const preview = await previewImport(accountId, statement, invertSigns, db);
    let matched = 0, inserted = 0, skipped = 0;

    for (const line of preview.lines) {
      if (line.outcome === 'duplicate') { skipped++; continue; }
      if (line.outcome === 'match' && line.matchId) {
        await db.query(
          `UPDATE transactions SET status = 'reconciled', fitid = COALESCE($2, fitid), statement_description = $3, updated_at = NOW() WHERE id = $1`,
          [line.matchId, line.fitid, line.description],
        );
        matched++;
        continue;
      }
      await createTransaction({
        accountId,
        date: line.date,
        amount: line.amount,
        description: line.description,
        categoryId: line.categoryId,
        kind: line.kind,
        source: 'import',
        status: 'imported',
        // transferência reconhecida por regra não precisa de revisão
        reviewed: line.kind === 'transfer',
        fitid: line.fitid,
        statementDescription: line.description,
      }, db);
      inserted++;
    }

    if (statement.balance !== null && account.kind !== 'credit_card') {
      await db.query(`UPDATE accounts SET balance = $2, balance_at = $3 WHERE id = $1`, [accountId, statement.balance, statement.balanceDate ?? statement.periodEnd]);
    }

    const dates = preview.lines.map((l) => l.date).sort();
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO imports (account_id, filename, period_start, period_end, total_lines, matched, inserted, skipped)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [accountId, filename, statement.periodStart ?? dates[0] ?? null, statement.periodEnd ?? dates[dates.length - 1] ?? null, preview.lines.length, matched, inserted, skipped],
    );
    return { importId: rows[0].id, matched, inserted, skipped };
  });
}

/**
 * Recalcula a fatura de todas as compras de uma conta (após mudar o dia de
 * fechamento ou o tipo da conta). Parcelas seguem a primeira do grupo.
 */
export async function recomputeInvoices(accountId: number, db: PoolClient) {
  const account = await getAccount(accountId, db);
  if (!account) return;
  if (account.kind !== 'credit_card' || !account.closing_day) {
    await db.query(`UPDATE transactions SET invoice_month = NULL WHERE account_id = $1`, [accountId]);
    return;
  }
  const closing = account.closing_day;
  const { rows } = await db.query<{ id: number; date: string; installment_group: string | null; installment_n: number | null }>(
    `SELECT id, date, installment_group, installment_n FROM transactions WHERE account_id = $1`, [accountId],
  );
  const firstDateOfGroup = new Map<string, string>();
  for (const r of rows) {
    if (r.installment_group && r.installment_n === 1) firstDateOfGroup.set(r.installment_group, r.date);
  }
  for (const r of rows) {
    let month: string;
    const first = r.installment_group ? firstDateOfGroup.get(r.installment_group) : undefined;
    if (r.installment_group && first && r.installment_n) month = addMonths(invoiceMonthFor(first, closing), r.installment_n - 1);
    else month = invoiceMonthFor(r.date, closing);
    await db.query(`UPDATE transactions SET invoice_month = $2 WHERE id = $1`, [r.id, monthStart(month)]);
  }
}
