import { todayISO, toISO, fromISO, isValidISO } from './dates';
import { parseAmount } from './money';
import { applyRules, normalizeText } from './rules';
import type { Account, Category, Rule, TxKind } from './types';

export type QuickParse = {
  amount: number; // já com sinal na conta escolhida
  description: string;
  date: string;
  kind: TxKind;
  /** para transferência: 'in' = entra na conta de investimento (aporte), 'out' = sai dela (resgate) */
  direction: 'in' | 'out';
  installments: number;
  account: Account | null;
  category: Category | null;
  warnings: string[];
};

/**
 * Entende frases do dia a dia sem IA:
 *   "almoço 42 crédito rico"       "uber 23,50"          "mercado 350 em 3x rico"
 *   "recebi 5000 salário nubank"   "aporte 2000 rico"    "ontem farmácia 89 débito"
 * Ordem importa: parcelas e datas saem da frase ANTES de procurar o valor, senão
 * "dia 15 almoço 42" viraria R$ 15.
 */
/** Último lançamento com a mesma descrição: de onde vêm categoria e conta quando a frase não diz. */
export type QuickHistory = Map<string, { categoryId: number | null; accountId: number | null }>;

export function quickParse(input: string, accounts: Account[], categories: Category[], rules: Rule[], history?: QuickHistory): QuickParse | null {
  const warnings: string[] = [];
  // notificação do banco colada no campo: "Compra aprovada R$ 42,00 em PADARIA" vira "PADARIA R$ 42,00"
  let text = ` ${input.trim().replace(/^(compra|pagamento)\s+(aprovad[ao]|realizad[ao]|confirmad[ao])(\s+de)?\s*/i, '').replace(/^voc[eê]\s+(fez|realizou)\s+(uma\s+)?(compra|pagamento)(\s+de)?\s*/i, '')} `;
  const today = todayISO();

  // parcelas: "em 3x", "3x", "3 vezes", "3 parcelas"
  let installments = 1;
  const inst = /\b(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas?)\b/i.exec(text);
  if (inst) { installments = Math.max(1, Number(inst[1])); text = text.replace(inst[0], ' '); }

  // data
  let date = today;
  const norm0 = normalizeText(text);
  if (/\bontem\b/.test(norm0)) { date = addDays(today, -1); text = text.replace(/\bontem\b/i, ' '); }
  else if (/\banteontem\b/.test(norm0)) { date = addDays(today, -2); text = text.replace(/\banteontem\b/i, ' '); }
  else if (/\bhoje\b/.test(norm0)) { text = text.replace(/\bhoje\b/i, ' '); }
  const explicit = /\b(?:dia\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (explicit) {
    const y = explicit[3] ? (explicit[3].length === 2 ? `20${explicit[3]}` : explicit[3]) : today.slice(0, 4);
    const candidate = `${y}-${explicit[2].padStart(2, '0')}-${explicit[1].padStart(2, '0')}`;
    if (isValidISO(candidate)) date = candidate;
    else warnings.push(`Data "${explicit[0].trim()}" não existe; usei hoje.`);
    text = text.replace(explicit[0], ' ');
  } else {
    const dayOnly = /\bdia\s+(\d{1,2})\b/i.exec(text);
    if (dayOnly) {
      const candidate = `${today.slice(0, 7)}-${dayOnly[1].padStart(2, '0')}`;
      if (isValidISO(candidate)) date = candidate;
      else warnings.push(`Dia ${dayOnly[1]} não existe neste mês; usei hoje.`);
      text = text.replace(dayOnly[0], ' ');
    }
  }

  // valor: primeiro número solto da frase (aceita 42, 42,50, 1.234,56, 1.500, R$ 42)
  const amountMatch = /(?:^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?=\s|$|reais)/i.exec(text.trim());
  if (!amountMatch) return null;
  let amount: number;
  try { amount = Math.abs(parseAmount(amountMatch[1])); } catch { return null; }
  if (!amount) return null;
  text = text.replace(amountMatch[0], ' ').replace(/\breais?\b/i, ' ');

  // tipo e direção
  const norm = normalizeText(text);
  let kind: TxKind = 'expense';
  let direction: 'in' | 'out' = 'in';
  if (/\b(recebi|recebimento|entrou|receita|ganhei|caiu)\b/.test(norm)) { kind = 'income'; text = text.replace(/\b(recebi|recebimento|entrou|receita|ganhei|caiu)\b/i, ' '); }
  else if (/\b(resgate|resgatei|saquei|retirei|saque)\b/.test(norm)) { kind = 'transfer'; direction = 'out'; }
  else if (/\b(aporte|aportei|apliquei|aplicacao|investi|transferi|transferencia)\b/.test(norm)) { kind = 'transfer'; }
  // receita sem verbo: "salário 5000", "estorno 50" (decidido antes da conta, que depende do tipo)
  else if (/\b(salario|pro labore|prolabore|reembolso|estorno|rendimento|dividendo|cashback|comissao|freela)\b/.test(norm)) { kind = 'income'; }

  // conta: nome ou instituição citados (vence o mais específico); a dica de crédito/débito
  // desempata quando a mesma instituição tem conta e cartão
  const wantsCredit = /\b(credito|cartao)\b/.test(norm);
  const wantsDebit = /\b(debito|pix|conta)\b/.test(norm);
  let account: Account | null = null;
  const active = accounts.filter((a) => !a.archived);
  let bestTerm = '';
  const candidates: Account[] = [];
  for (const a of active) {
    for (const term of [a.name, a.institution ?? ''].map(normalizeText).filter(Boolean)) {
      const re = new RegExp(`\\b${escapeRe(term)}\\b`);
      if (!re.test(norm)) continue;
      if (term.length > bestTerm.length) { bestTerm = term; candidates.length = 0; candidates.push(a); }
      else if (term.length === bestTerm.length && !candidates.includes(a)) candidates.push(a);
    }
  }
  if (candidates.length) {
    account = candidates.find((a) => wantsCredit && a.kind === 'credit_card')
      ?? candidates.find((a) => wantsDebit && a.kind === 'checking')
      ?? candidates.find((a) => kind === 'transfer' && a.kind === 'investment')
      ?? candidates[0];
    for (const w of bestTerm.split(' ')) text = replaceNormalized(text, w);
  }
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
  if (!description) description = kind === 'income' ? 'Receita' : kind === 'transfer' ? (direction === 'out' ? 'Resgate' : 'Aporte') : 'Gasto';
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
  // histórico: mesma descrição lançada antes traz a categoria (e a conta, se a frase não citou nenhuma)
  const past = history?.get(normalizeText(description));
  if (past) {
    if (!category && past.categoryId) category = categories.find((c) => c.id === past.categoryId) ?? null;
    if (!candidates.length && !wantsCredit && !wantsDebit && past.accountId) account = active.find((a) => a.id === past.accountId) ?? account;
  }

  return { amount: signedAmount(amount, kind, direction, account), description, date, kind, direction, installments, account, category, warnings };
}

/** Sinal do valor na conta em que vai ser gravado. */
export function signedAmount(abs: number, kind: TxKind, direction: 'in' | 'out', account: Account | null): number {
  if (kind === 'expense') return -abs;
  if (kind === 'income') return abs;
  // transferência: na conta de investimento, aporte entra e resgate sai; nas demais, o inverso
  const intoInvestment = account?.kind === 'investment';
  return (direction === 'in') === intoInvestment ? abs : -abs;
}

const KEYWORDS: Array<[RegExp, string]> = [
  [/\b(almoco|jantar|cafe|lanche|restaurante|ifood|padaria|pizza|hamburguer|sushi|bar|cerveja|delivery)\b/, 'Alimentação'],
  [/\b(mercado|supermercado|feira|hortifruti|acougue|atacad)/, 'Mercado'],
  [/\b(uber|99|taxi|gasolina|combustivel|posto|estacionamento|pedagio|onibus|metro|passagem)\b/, 'Transporte'],
  [/\b(farmacia|remedio|medico|consulta|dentista|exame|academia|plano de saude|psicolog)/, 'Saúde'],
  [/\b(aluguel|condominio|luz|energia|agua|internet|gas|iptu|reforma)\b/, 'Moradia'],
  [/\b(netflix|spotify|youtube|prime|disney|hbo|assinatura|icloud|chatgpt|claude|adobe|figma|notion)\b/, 'Assinaturas'],
  [/\b(cinema|show|ingresso|jogo|steam|playstation|bike|passeio)\b/, 'Lazer'],
  [/\b(roupa|tenis|sapato|camisa|calca|amazon|shopee|mercado livre|magalu|loja)\b/, 'Compras'],
  [/\b(curso|livro|faculdade|escola|udemy|alura)\b/, 'Educação'],
  [/\b(hotel|airbnb|voo|passagem aerea|latam|gol|azul|viagem)\b/, 'Viagem'],
  [/\b(imposto|taxa|darf|simples nacional|inss|multa|iof|tarifa)\b/, 'Impostos e taxas'],
  [/\b(barbearia|cabelo|barbeiro|salao|presente)\b/, 'Pessoal'],
  [/\b(salario|pro labore|prolabore|pagamento cliente|comissao|freela)\b/, 'Salário'],
  [/\b(rendimento|dividendo|juros|cdb|tesouro)\b/, 'Rendimentos'],
  [/\b(reembolso|estorno|cashback)\b/, 'Reembolso'],
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
