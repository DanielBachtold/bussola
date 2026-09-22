'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { parseOFX } from '@/lib/ofx';
import { parseCSV } from '@/lib/csv';
import { parsePDF } from '@/lib/pdf';
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

/**
 * Descobre o formato pelo conteúdo, não pela extensão: o celular às vezes
 * renomeia o arquivo, e tem banco que entrega OFX com nome .txt.
 */
async function parseAnything(filename: string, bytes: Uint8Array): Promise<ParsedStatement> {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
  const lower = filename.toLowerCase();
  if (head.startsWith('%PDF') || lower.endsWith('.pdf')) return parsePDF(bytes, filename);
  if (/<OFX>|OFXHEADER/i.test(head) || /\.(ofx|qfx|ofc)$/.test(lower)) return parseOFX(decodeText(bytes));
  if (/\.(csv|txt|tsv)$/.test(lower) || /[;,\t]/.test(head.split('\n')[0] ?? '')) return parseCSV(decodeText(bytes));
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) throw new Error('Esse arquivo é um ZIP (ou xlsx). Descompacte, ou exporte em OFX, CSV ou PDF.');
  throw new Error('Não reconheci o formato. Exporte o extrato em OFX (melhor), CSV ou PDF.');
}

/** Bancos brasileiros ainda exportam OFX/CSV em latin1 com frequência. */
function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  return utf8.includes('\uFFFD') ? new TextDecoder('latin1').decode(bytes) : utf8;
}

export async function previewUpload(_prev: PreviewState | undefined, formData: FormData): Promise<PreviewState> {
  await requireSession();
  try {
    const file = formData.get('file');
    const pasted = String(formData.get('pasted') ?? '').trim();
    const accountId = Number(formData.get('account_id'));
    if (!accountId) return { error: 'Escolha a conta.' };
    const invertSigns = formData.get('invert') === 'on';

    if (pasted) {
      const statement = /<OFX>|OFXHEADER/i.test(pasted.slice(0, 2048)) ? parseOFX(pasted) : parseCSV(pasted);
      if (!statement.lines.length) return { error: 'Não achei lançamentos no texto colado.' };
      return buildPreview(accountId, statement, 'texto colado', invertSigns);
    }
    if (!(file instanceof File) || file.size === 0) return { error: 'Escolha um arquivo ou cole o texto do extrato.' };
    if (file.size > 9 * 1024 * 1024) return { error: `O arquivo tem ${(file.size / 1024 / 1024).toFixed(1)} MB; o limite é 9 MB. Exporte um período menor.` };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const statement = await parseAnything(file.name, bytes);
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
