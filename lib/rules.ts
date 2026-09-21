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
    if (text.includes(normalizeText(r.pattern))) {
      return { category_id: r.category_id, kind: r.kind };
    }
  }
  return { category_id: null, kind: null };
}

/**
 * Quando o Daniel categoriza uma linha importada, o sistema aprende: extrai
 * um padrão do texto do extrato (sem números, datas e ruído) e salva a regra.
 */
export function patternFromDescription(description: string): string | null {
  let p = normalizeText(description)
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, ' ')
    .replace(/\b\d+[.,]?\d*\b/g, ' ')
    .replace(/[*#|:_\-]+/g, ' ')
    .replace(/\b(compra|pagamento|pgto|no|na|em|de|do|da|parc(ela)?|x|cartao|debito|credito|pix|ted|doc|enviado|recebido)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (p.length < 3) return null;
  // limita a 3 palavras: suficiente pra identificar o estabelecimento
  p = p.split(' ').slice(0, 3).join(' ');
  return p;
}

export async function upsertRule(db: Queryable, pattern: string, categoryId: number | null, kind: TxKind | null) {
  const { rows } = await db.query(`SELECT id FROM category_rules WHERE pattern = $1`, [pattern]);
  if (rows.length) {
    await db.query(`UPDATE category_rules SET category_id = $2, kind = $3 WHERE id = $1`, [rows[0].id, categoryId, kind]);
  } else {
    await db.query(`INSERT INTO category_rules (pattern, category_id, kind) VALUES ($1, $2, $3)`, [pattern, categoryId, kind]);
  }
}
