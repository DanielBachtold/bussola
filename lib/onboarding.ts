import { pool, type Queryable } from './db';
import { getSetting } from './budget';

export type Step = { key: string; title: string; detail: string; href: string; done: boolean };

/**
 * Checklist de começo: só aparece enquanto faltar algo essencial. Some sozinho
 * quando tudo está feito (ou quando o usuário dispensa).
 */
export async function onboardingSteps(db: Queryable = pool): Promise<{ steps: Step[]; done: number; dismissed: boolean }> {
  const [{ rows: acc }, { rows: rec }, { rows: tx }, { rows: imp }, income, dismissed] = await Promise.all([
    db.query<{ kind: string; closing_day: number | null }>(`SELECT kind, closing_day FROM accounts WHERE archived = FALSE`),
    db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM recurring_rules WHERE active = TRUE`),
    db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM transactions WHERE source IN ('manual','chat')`),
    db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM imports`),
    getSetting('monthly_income', db),
    getSetting('onboarding_dismissed', db),
  ]);
  const hasChecking = acc.some((a) => a.kind === 'checking');
  const hasCard = acc.some((a) => a.kind === 'credit_card' && a.closing_day);
  const steps: Step[] = [
    { key: 'accounts', title: 'Cadastrar a conta corrente e os cartões', detail: 'Com o dia de fechamento e vencimento de cada cartão. Corretoras também.', href: '/config', done: hasChecking && hasCard },
    { key: 'income', title: 'Definir a renda mensal', detail: 'É a base dos percentuais do orçamento. Sem ela, uso a receita real do mês.', href: '/config#orcamento', done: Boolean(income) },
    { key: 'fixed', title: 'Cadastrar os fixos', detail: 'Aluguel, financiamento, faculdade, assinaturas. Eu lanço no dia certo.', href: '/config#fixos', done: (rec[0]?.n ?? 0) > 0 },
    { key: 'first', title: 'Lançar o primeiro gasto', detail: 'Pela barra: "almoço 42 crédito rico".', href: '/lancar', done: (tx[0]?.n ?? 0) > 0 },
    { key: 'import', title: 'Importar o primeiro extrato', detail: 'OFX da conta e do cartão. Reimportar não duplica.', href: '/importar', done: (imp[0]?.n ?? 0) > 0 },
  ];
  return { steps, done: steps.filter((s) => s.done).length, dismissed: dismissed === '1' };
}
