'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { parseOFX } from '@/lib/ofx';
import { parseCSV } from '@/lib/csv';
import { commitImport, previewImport, undoImport as undoImportRows, type ImportPreview } from '@/lib/reconcile';
import type { ParsedStatement } from '@/lib/statement';
import { listAccounts } from '@/lib/queries';

export type PreviewState = {
  error?: string;
  preview?: ImportPreview;
  statement?: ParsedStatement;
  filename?: string;
  invertSigns?: boolean;
  /** o número da conta no arquivo bate com OUTRA conta cadastrada */
  acctMatch?: { id: number; name: string } | null;
};

function parseFile(filename: string, text: string): ParsedStatement {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.ofx') || lower.endsWith('.qfx') || /<OFX>/i.test(text)) return parseOFX(text);
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseCSV(text);
  throw new Error('Formato não suportado. Envie OFX (preferido) ou CSV.');
}

async function readUpload(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  // bancos brasileiros ainda exportam OFX em latin1 com frequência
  const utf8 = buf.toString('utf8');
  return utf8.includes('�') ? buf.toString('latin1') : utf8;
}

export async function previewUpload(_prev: PreviewState | undefined, formData: FormData): Promise<PreviewState> {
  await requireSession();
  try {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return { error: 'Escolha um arquivo.' };
    const accountId = Number(formData.get('account_id'));
    if (!accountId) return { error: 'Escolha a conta.' };
    const invertSigns = formData.get('invert') === 'on';
    const text = await readUpload(file);
    const statement = parseFile(file.name, text);
    if (!statement.lines.length) return { error: 'Nenhuma transação encontrada no arquivo.' };
    return buildPreview(accountId, statement, file.name, invertSigns);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao ler o arquivo.' };
  }
}

async function buildPreview(accountId: number, statement: ParsedStatement, filename: string, invertSigns: boolean): Promise<PreviewState> {
  const client = await pool.connect();
  try {
    const preview = await previewImport(accountId, statement, invertSigns, client);
    let acctMatch: PreviewState['acctMatch'] = null;
    if (statement.acctId) {
      const other = (await listAccounts(client)).find((a) => a.ofx_acctid === statement.acctId && a.id !== accountId);
      if (other) acctMatch = { id: other.id, name: other.name };
    }
    return { preview, statement, filename, invertSigns, acctMatch };
  } finally {
    client.release();
  }
}

/** Refaz a prévia com outra conta ou sinal invertido, sem reenviar o arquivo. */
export async function previewParsed(accountId: number, statement: ParsedStatement, filename: string, invertSigns: boolean): Promise<PreviewState> {
  await requireSession();
  try {
    return await buildPreview(accountId, statement, filename, invertSigns);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao montar a prévia.' };
  }
}

export async function undoImport(importId: number): Promise<{ ok: true; deleted: number; unmatched: number } | { ok: false; error: string }> {
  await requireSession();
  try {
    const r = await undoImportRows(importId);
    for (const p of ['/', '/transacoes', '/faturas', '/revisar', '/importar', '/viagens']) revalidatePath(p);
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro ao desfazer.' };
  }
}

export async function confirmImport(accountId: number, filename: string, statement: ParsedStatement, invertSigns: boolean): Promise<{ ok: true; matched: number; inserted: number; skipped: number; importId: number } | { ok: false; error: string }> {
  await requireSession();
  try {
    const result = await commitImport(accountId, filename, statement, invertSigns);
    for (const p of ['/', '/transacoes', '/faturas', '/revisar', '/importar', '/viagens']) revalidatePath(p);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro ao importar.' };
  }
}
