import { pool, type Queryable } from './db';
import { getSetting } from './budget';
import { isSelfTransfer, normalizeText, parseNames } from './rules';

export type TransferCandidate = {
  key: string;         // padrão normalizado que identifica o grupo
  label: string;       // como aparece no extrato
  count: number;
  total: number;       // soma absoluta
  kind: 'expense' | 'income';
  reason: 'nome' | 'palavra' | 'valor';
  ids: number[];
};

/**
 * Palavras que indicam dinheiro mudando de lugar. "Transferência enviada pelo Pix"
 * NÃO entra: é como o Nubank escreve qualquer Pix, inclusive o do café.
 */
const HINTS = /\b(caixinha|guardad|resgat|aplica[cç]|rdb|cdb\b|poupanc|tesouro direto|compra de a[cç][oõ]es|venda de a[cç][oõ]es|previdencia|entre contas|mesma titularidade|conta investimento)/;

/**
 * O que ainda está contado como gasto (ou receita) e cheira a transferência:
 * nome do próprio usuário na contraparte, palavra típica de investimento, ou
 * valor alto e redondo. Agrupado por padrão, pra resolver em um toque.
 */
export async function transferCandidates(monthsBack = 12, db: Queryable = pool): Promise<TransferCandidate[]> {
  const myNames = parseNames(await getSetting('my_names', db));
  const { rows } = await db.query<{ id: number; description: string; statement_description: string | null; amount: number; kind: 'expense' | 'income' }>(
    `SELECT id, description, statement_description, amount, kind FROM transactions
     WHERE kind IN ('expense','income') AND date >= CURRENT_DATE - ($1 || ' months')::interval`,
    [monthsBack],
  );

  const groups = new Map<string, TransferCandidate>();
  for (const r of rows) {
    const text = r.statement_description ?? r.description;
    const n = normalizeText(text);
    const self = isSelfTransfer(text, myNames);
    const hinted = HINTS.test(n);
    // Pix alto e redondo costuma ser dinheiro trocando de bolso, não compra
    const big = Math.abs(r.amount) >= 1000 && Math.abs(r.amount) % 500 === 0 && /\b(pix|ted|doc|transferencia)\b/.test(n);
    if (!self && !hinted && !big) continue;
    const key = patternOf(n);
    const g = groups.get(key) ?? { key, label: shorten(text), count: 0, total: 0, kind: r.kind, reason: self ? 'nome' : hinted ? 'palavra' : 'valor', ids: [] };
    g.count += 1;
    g.total += Math.abs(r.amount);
    g.ids.push(r.id);
    if (self) g.reason = 'nome';
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

/** Chave do grupo: tira números, datas e lixo, e fica com as primeiras palavras que identificam a contraparte. */
function patternOf(normalized: string): string {
  return normalized
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, ' ')
    .replace(/\b\d+[.,]?\d*\b/g, ' ')
    .replace(/[*#|:_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 6)
    .join(' ');
}

function shorten(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

export type NameSuggestion = { name: string; sent: number; received: number; total: number };

/**
 * Quem aparece no extrato mandando E recebendo costuma ser a própria pessoa
 * (conta em outro banco) ou alguém com quem ela divide dinheiro. Serve pra
 * perguntar "qual desses é você?" em vez de exigir digitação.
 */
export async function counterpartySuggestions(db: Queryable = pool): Promise<NameSuggestion[]> {
  const { rows } = await db.query<{ description: string; statement_description: string | null; amount: number }>(
    `SELECT description, statement_description, amount FROM transactions
     WHERE kind IN ('expense','income') AND date >= CURRENT_DATE - INTERVAL '12 months'`,
  );
  const map = new Map<string, NameSuggestion>();
  for (const r of rows) {
    const name = counterparty(r.statement_description ?? r.description);
    if (!name) continue;
    const key = normalizeText(name);
    const s = map.get(key) ?? { name, sent: 0, received: 0, total: 0 };
    if (r.amount < 0) s.sent += 1; else s.received += 1;
    s.total += Math.abs(r.amount);
    map.set(key, s);
  }
  return [...map.values()].filter((s) => s.sent > 0 && s.received > 0).sort((a, b) => b.total - a.total).slice(0, 8);
}

/** "Transferência enviada pelo Pix - FULANO DE TAL - •••.123..." -> "FULANO DE TAL" */
export function counterparty(text: string): string | null {
  const m = /(?:pix|ted|doc|transfer[êe]ncia)[^-]*-\s*([^-•\n]{3,60})/i.exec(text);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, ' ').trim();
  if (/^\d+$/.test(name) || name.length < 3) return null;
  return name;
}
