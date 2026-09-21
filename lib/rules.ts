import type { Queryable } from './db';
import type { Rule, TxKind } from './types';

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function listRules(db: Queryable): Promise<Rule[]> {
  const { rows } = await db.query<Rule>(
    `SELECT r.id, r.pattern, r.category_id, r.kind, c.name AS category_name
     FROM category_rules r LEFT JOIN categories c ON c.id = r.category_id
     ORDER BY length(r.pattern) DESC, r.id`,
  );
  return rows;
}

/**
 * Aplica a primeira regra cujo padrão aparece na descrição. Regras mais longas
 * têm prioridade (são mais específicas). Devolve categoria e/ou tipo.
 */
export function applyRules(description: string, rules: Rule[]): { category_id: number | null; kind: TxKind | null } {
  const text = normalizeText(description);
  for (const r of rules) {
    const pattern = normalizeText(r.pattern);
    if (!pattern) continue;
    // fronteira de palavra: "uber" não pode casar dentro de "tuberculose"
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(pattern)}([^a-z0-9]|$)`);
    if (re.test(text)) return { category_id: r.category_id, kind: r.kind };
  }
  return { category_id: null, kind: null };
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Palavras que aparecem em qualquer linha de extrato e não identificam ninguém.
// Uma regra feita só delas categorizaria tudo (ex.: todo Pix viraria "Alimentação").
const GENERIC = new Set([
  'pix', 'ted', 'doc', 'transferencia', 'transf', 'enviado', 'enviada', 'recebido', 'recebida', 'pagamento', 'pgto', 'pag',
  'compra', 'cartao', 'debito', 'credito', 'parcela', 'parc', 'boleto', 'saque', 'deposito', 'tarifa', 'lancamento',
  'nubank', 'nu', 'rico', 'xp', 'btg', 'itau', 'bradesco', 'santander', 'inter', 'c6', 'caixa', 'bb', 'sicredi', 'sicoob',
  'ltda', 'me', 'sa', 'eireli', 'mei', 'com', 'de', 'do', 'da', 'no', 'na', 'em', 'e', 'a', 'o', 'x',
]);

/**
 * Quando o Daniel categoriza uma linha importada, o sistema aprende: extrai
 * um padrão do texto do extrato (sem números, datas e ruído) e salva a regra.
 */
export function patternFromDescription(description: string): string | null {
  const p = normalizeText(description)
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, ' ')
    .replace(/\b\d+[.,]?\d*\b/g, ' ')
    .replace(/[*#|:_\-]+/g, ' ')
    .replace(/\b(compra|pagamento|pgto|no|na|em|de|do|da|parc(ela)?|x|cartao|debito|credito|pix|ted|doc|enviado|recebido)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (p.length < 3) return null;
  const words = p.split(' ').filter((w) => w && !GENERIC.has(w));
  // precisa sobrar pelo menos uma palavra que identifique o estabelecimento
  if (!words.some((w) => w.length >= 3)) return null;
  // limita a 3 palavras: suficiente pra identificar o estabelecimento
  return words.slice(0, 3).join(' ');
}

export async function upsertRule(db: Queryable, pattern: string, categoryId: number | null, kind: TxKind | null) {
  const { rows } = await db.query(`SELECT id FROM category_rules WHERE pattern = $1`, [pattern]);
  if (rows.length) {
    await db.query(`UPDATE category_rules SET category_id = $2, kind = $3 WHERE id = $1`, [rows[0].id, categoryId, kind]);
  } else {
    await db.query(`INSERT INTO category_rules (pattern, category_id, kind) VALUES ($1, $2, $3)`, [pattern, categoryId, kind]);
  }
}
