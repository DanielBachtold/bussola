import { todayISO, toISO, fromISO } from './dates';
import { parseAmount } from './money';
import { applyRules, normalizeText } from './rules';
import type { Account, Category, Rule, TxKind } from './types';

export type QuickParse = {
  amount: number; // já com sinal
  description: string;
  date: string;
  kind: TxKind;
  installments: number;
  account: Account | null;
  category: Category | null;
  warnings: string[];
};

/**
 * Entende frases do dia a dia sem IA:
 *   "almoço 42 crédito rico"       "uber 23,50"          "mercado 350 em 3x rico"
 *   "recebi 5000 salário nubank"   "aporte 2000 rico"    "ontem farmácia 89 débito"
 */
export function quickParse(input: string, accounts: Account[], categories: Category[], rules: Rule[]): QuickParse | null {
  const warnings: string[] = [];
  let text = ` ${input.trim()} `;

  // valor: primeiro número da frase (aceita 42, 42,50, 1.234,56, R$ 42)
  const amountMatch = /(?:r\$\s*)?(-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)(?=\s|$|x\b|reais)/i.exec(text.trim());
  if (!amountMatch) return null;
  let amount = Math.abs(parseAmount(amountMatch[1]));
  if (!amount) return null;
  text = text.replace(amountMatch[0], ' ').replace(/\breais?\b/i, ' ');

  // parcelas: "em 3x", "3x", "3 vezes", "3 parcelas"
  let installments = 1;
  const inst = /\b(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas?)\b/i.exec(text);
  if (inst) { installments = Math.max(1, Number(inst[1])); text = text.replace(inst[0], ' '); }

  // data
  let date = todayISO();
  const norm = normalizeText(text);
  if (/\bontem\b/.test(norm)) { date = addDays(date, -1); text = text.replace(/\bontem\b/i, ' '); }
  else if (/\banteontem\b/.test(norm)) { date = addDays(date, -2); text = text.replace(/\banteontem\b/i, ' '); }
  else if (/\bhoje\b/.test(norm)) { text = text.replace(/\bhoje\b/i, ' '); }
  const explicit = /\b(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (explicit) {
    const y = explicit[3] ? (explicit[3].length === 2 ? `20${explicit[3]}` : explicit[3]) : date.slice(0, 4);
    date = `${y}-${explicit[2].padStart(2, '0')}-${explicit[1].padStart(2, '0')}`;
    text = text.replace(explicit[0], ' ');
  } else {
    const dayOnly = /\bdia\s+(\d{1,2})\b/i.exec(text);
    if (dayOnly) { date = `${date.slice(0, 7)}-${dayOnly[1].padStart(2, '0')}`; text = text.replace(dayOnly[0], ' '); }
  }

  // tipo
  let kind: TxKind = 'expense';
  if (/\b(recebi|recebimento|entrou|receita|ganhei|caiu)\b/.test(norm)) { kind = 'income'; text = text.replace(/\b(recebi|recebimento|entrou|receita|ganhei|caiu)\b/i, ' '); }
  else if (/\b(aporte|apliquei|aplicacao|investi|transferi|transferencia|resgate|resgatei)\b/.test(norm)) { kind = 'transfer'; }

  // conta: nome ou instituição citados (vence o mais específico); senão, pista de crédito/débito
  let account: Account | null = null;
  const active = accounts.filter((a) => !a.archived);
  let bestMatch: { account: Account; term: string } | null = null;
  for (const a of active) {
    for (const term of [a.name, a.institution ?? ''].map(normalizeText).filter(Boolean)) {
      const re = new RegExp(`\\b${escapeRe(term)}\\b`, 'i');
      if (re.test(normalizeText(text)) && (!bestMatch || term.length > bestMatch.term.length)) bestMatch = { account: a, term };
    }
  }
  if (bestMatch) {
    account = bestMatch.account;
    for (const w of bestMatch.term.split(' ')) text = replaceNormalized(text, w);
  }
  const wantsCredit = /\b(credito|cartao)\b/.test(normalizeText(text));
  const wantsDebit = /\b(debito|pix|conta)\b/.test(normalizeText(text));
  text = text.replace(/\b(no|na|em)?\s*(cr[eé]dito|cart[aã]o|d[eé]bito|pix)\b/gi, ' ');
  if (!account) {
    const pick = (k: Account['kind']) => {
      const list = active.filter((a) => a.kind === k);
      return list.length === 1 ? list[0] : null;
    };
    if (kind === 'transfer') account = pick('investment');
    else if (wantsCredit) account = pick('credit_card');
    else if (wantsDebit) account = pick('checking');
    else if (kind === 'income') account = pick('checking');
    else account = pick('credit_card') ?? pick('checking');
    if (!account) warnings.push('Não identifiquei a conta. Escolha abaixo.');
  }
  if (account && account.kind !== 'credit_card' && installments > 1) {
    warnings.push('Parcelas só fazem sentido no cartão de crédito.');
  }

  // descrição: o que sobrou
  let description = text.replace(/\b(no|na|em|de|do|da|com)\s*$/i, '').replace(/\s+/g, ' ').trim();
  description = description.replace(/^(no|na|em|de|do|da)\s+/i, '').trim();
  if (!description) description = kind === 'income' ? 'Receita' : kind === 'transfer' ? 'Aporte' : 'Gasto';
  description = description.charAt(0).toUpperCase() + description.slice(1);

  // categoria: regras do banco primeiro, depois palavras-chave comuns
  let category: Category | null = null;
  const applied = applyRules(description, rules);
  if (applied.kind) kind = applied.kind;
  if (applied.category_id) category = categories.find((c) => c.id === applied.category_id) ?? null;
  if (!category && kind !== 'transfer') {
    const guess = guessCategory(description, kind);
    if (guess) category = categories.find((c) => normalizeText(c.name) === normalizeText(guess)) ?? null;
  }

  if (kind === 'expense') amount = -amount;
  if (kind === 'transfer' && account?.kind !== 'investment') amount = -amount;

  return { amount, description, date, kind, installments, account, category, warnings };
}

const KEYWORDS: Array<[RegExp, string]> = [
  [/\b(almoco|jantar|cafe|lanche|restaurante|ifood|padaria|pizza|hamburguer|sushi|bar|cerveja|delivery)\b/, 'Alimentação'],
  [/\b(mercado|supermercado|feira|hortifruti|acougue|atacad)/, 'Mercado'],
  [/\b(uber|99|taxi|gasolina|combustivel|posto|estacionamento|pedagio|onibus|metro|passagem)\b/, 'Transporte'],
  [/\b(farmacia|remedio|medico|consulta|dentista|exame|academia|plano de saude|psicolog)/, 'Saúde'],
  [/\b(aluguel|condominio|luz|energia|agua|internet|gas|iptu|reforma)\b/, 'Moradia'],
  [/\b(netflix|spotify|youtube|prime|disney|hbo|assinatura|icloud|chatgpt|claude|adobe|figma|notion)\b/, 'Assinaturas'],
  [/\b(cinema|show|ingresso|jogo|steam|playstation|bike|passeio|viagem)\b/, 'Lazer'],
  [/\b(roupa|tenis|sapato|camisa|calca|amazon|shopee|mercado livre|magalu|loja)\b/, 'Compras'],
  [/\b(curso|livro|faculdade|escola|udemy|alura)\b/, 'Educação'],
  [/\b(hotel|airbnb|voo|passagem aerea|latam|gol|azul)\b/, 'Viagem'],
  [/\b(imposto|taxa|darf|das|inss|multa|iof|tarifa)\b/, 'Impostos e taxas'],
  [/\b(barbearia|cabelo|barbeiro|salao|presente)\b/, 'Pessoal'],
  [/\b(salario|pro labore|prolabore|pagamento cliente)\b/, 'Salário'],
  [/\b(rendimento|dividendo|juros|cdb|tesouro)\b/, 'Rendimentos'],
  [/\b(reembolso|estorno)\b/, 'Reembolso'],
];

export function guessCategory(description: string, kind: TxKind): string | null {
  const n = normalizeText(description);
  for (const [re, cat] of KEYWORDS) {
    if (re.test(n)) {
      const isIncomeCat = ['Salário', 'Rendimentos', 'Reembolso'].includes(cat);
      if ((kind === 'income') === isIncomeCat) return cat;
    }
  }
  return kind === 'income' ? 'Outras receitas' : null;
}

function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove uma palavra do texto original comparando sem acento. */
function replaceNormalized(text: string, normalizedWord: string): string {
  const words = text.split(/(\s+)/);
  return words.map((w) => (normalizeText(w) === normalizedWord ? '' : w)).join('');
}
