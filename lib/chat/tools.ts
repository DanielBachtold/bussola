import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { currentMonth, invoiceDates, monthEnd, monthStart, openInvoiceMonth, todayISO } from '@/lib/dates';
import { computeInsights } from '@/lib/insights';
import { getBudgetStatus, listGroups, setSetting } from '@/lib/budget';
import { pool } from '@/lib/db';
import { listTrips, tripStatus } from '@/lib/trips';
import {
  categoryAverages, createTransaction, expensesByCategory, findAccountByName, findCategoryByName, futureCommitments,
  invoiceSummaries, latestAllocation, listAccounts, listCategories, listTransactions, monthTotals, monthlySeries, netWorthSeries,
} from '@/lib/queries';
import type { TxKind } from '@/lib/types';

/**
 * Ferramentas do chat: o modelo nunca vê o banco inteiro, ele pede o recorte
 * que precisa e recebe números exatos. Cada ferramenta valida a entrada com
 * zod antes de rodar (o SDK pode devolver JSON parcial em streaming).
 */

const MesSchema = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).optional() });
const ListarSchema = z.object({
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  conta: z.string().optional(),
  categoria: z.string().optional(),
  tipo: z.enum(['expense', 'income', 'transfer']).optional(),
  busca: z.string().optional(),
  limite: z.number().int().min(1).max(300).optional(),
});
const FaturasSchema = z.object({ cartao: z.string().optional() });
const SerieSchema = z.object({ meses: z.number().int().min(2).max(36).optional() });
const RegistrarSchema = z.object({
  conta: z.string(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valor: z.number().positive(),
  descricao: z.string().min(1),
  tipo: z.enum(['expense', 'income', 'transfer']).optional(),
  categoria: z.string().optional(),
  parcelas: z.number().int().min(1).max(48).optional(),
});

export const toolDefinitions: Anthropic.Beta.BetaTool[] = [
  {
    name: 'resumo_mes',
    description: 'Resumo financeiro de um mês: receita, gasto, resultado, gasto por categoria com média dos 3 meses anteriores, e os insights calculados. Use para perguntas do tipo "como está meu mês", "quanto gastei com X".',
    input_schema: { type: 'object', properties: { mes: { type: 'string', description: 'YYYY-MM. Padrão: mês atual.' } }, additionalProperties: false },
    strict: true,
  },
  {
    name: 'listar_transacoes',
    description: 'Lista lançamentos num período, com filtros opcionais por conta, categoria, tipo e texto. Use para detalhar, achar um gasto específico ou somar algo que o resumo não cobre.',
    input_schema: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'YYYY-MM-DD' },
        fim: { type: 'string', description: 'YYYY-MM-DD' },
        conta: { type: 'string', description: 'nome da conta (parcial)' },
        categoria: { type: 'string', description: 'nome da categoria (parcial)' },
        tipo: { type: 'string', enum: ['expense', 'income', 'transfer'] },
        busca: { type: 'string', description: 'texto na descrição' },
        limite: { type: 'integer', description: 'máximo de linhas, padrão 100' },
      },
      required: ['inicio', 'fim'],
      additionalProperties: false,
    },
  },
  {
    name: 'faturas',
    description: 'Faturas dos cartões: valor por mês de fechamento, fatura aberta com datas de fechamento e vencimento, e parcelas já comprometidas nos meses seguintes.',
    input_schema: { type: 'object', properties: { cartao: { type: 'string', description: 'nome do cartão (parcial). Padrão: todos.' } }, additionalProperties: false },
    strict: true,
  },
  {
    name: 'serie_mensal',
    description: 'Receita e gasto mês a mês nos últimos N meses. Use para tendência e comparação entre meses.',
    input_schema: { type: 'object', properties: { meses: { type: 'integer', description: 'padrão 12' } }, additionalProperties: false },
    strict: true,
  },
  {
    name: 'orcamento',
    description: 'Orçamento por percentual da renda: grupos (necessidades, lazer, educação, investimentos...), limite e gasto de cada um no mês, e os alertas ativos.',
    input_schema: { type: 'object', properties: { mes: { type: 'string', description: 'YYYY-MM. Padrão: mês atual.' } }, additionalProperties: false },
    strict: true,
  },
  {
    name: 'viagens',
    description: 'Viagens cadastradas: período, teto de gastos, quanto já foi gasto dentro do teto, ritmo por dia, itens pré-pagos fora do teto e os gastos da viagem.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: 'investimentos',
    description: 'Patrimônio investido: posição mais recente por ativo e conta, evolução mensal e aportes registrados.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: 'criar_viagem',
    description: 'Cria uma viagem com período e teto de gastos. Use quando o usuário disser que vai viajar e quiser um limite pro período. Gastos já lançados nas datas entram no teto.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        inicio: { type: 'string', description: 'YYYY-MM-DD' },
        fim: { type: 'string', description: 'YYYY-MM-DD' },
        teto: { type: 'number', description: 'limite de gastos durante a viagem, em reais' },
      },
      required: ['nome', 'inicio', 'fim'],
      additionalProperties: false,
    },
  },
  {
    name: 'definir_orcamento',
    description: 'Ajusta a renda mensal base e/ou o percentual de um grupo do orçamento (necessidades, lazer, educação, investimentos).',
    input_schema: {
      type: 'object',
      properties: {
        renda_mensal: { type: 'number' },
        grupo: { type: 'string', description: 'nome do grupo (parcial)' },
        percentual: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'registrar_lancamento',
    description: 'Registra um gasto, receita ou transferência. Só chame quando o usuário pedir explicitamente para registrar/lançar algo. Valor sempre positivo; o tipo define o sinal. Parcelas só em cartão de crédito.',
    input_schema: {
      type: 'object',
      properties: {
        conta: { type: 'string', description: 'nome da conta (parcial)' },
        data: { type: 'string', description: 'YYYY-MM-DD' },
        valor: { type: 'number' },
        descricao: { type: 'string' },
        tipo: { type: 'string', enum: ['expense', 'income', 'transfer'], description: 'padrão expense' },
        categoria: { type: 'string', description: 'nome da categoria (parcial)' },
        parcelas: { type: 'integer' },
      },
      required: ['conta', 'data', 'valor', 'descricao'],
      additionalProperties: false,
    },
  },
];

export async function runTool(name: string, rawInput: unknown): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  try {
    switch (name) {
      case 'resumo_mes': {
        const { mes } = MesSchema.parse(rawInput ?? {});
        const month = mes ?? currentMonth();
        const [totals, byCat, avg, insights] = await Promise.all([
          monthTotals(month), expensesByCategory(monthStart(month), monthEnd(month)), categoryAverages(month, 3), computeInsights(month),
        ]);
        return { ok: true, result: {
          mes: month,
          receita: totals.income, gasto: totals.expense, resultado: totals.income - totals.expense,
          por_categoria: byCat.map((c) => ({ categoria: c.name, total: c.total, lancamentos: c.count, media_3m: avg.get(c.category_id) ?? 0, orcamento: c.budget })),
          insights: insights.map((i) => `${i.title}. ${i.detail}`),
        } };
      }
      case 'listar_transacoes': {
        const p = ListarSchema.parse(rawInput);
        const account = p.conta ? await findAccountByName(p.conta) : null;
        const category = p.categoria ? await findCategoryByName(p.categoria) : null;
        if (p.conta && !account) return { ok: false, error: `Conta "${p.conta}" não encontrada.` };
        if (p.categoria && !category) return { ok: false, error: `Categoria "${p.categoria}" não encontrada.` };
        const rows = await listTransactions({ start: p.inicio, end: p.fim, accountId: account?.id, categoryId: category?.id, kind: p.tipo, search: p.busca, limit: p.limite ?? 100 });
        const total = rows.reduce((a, t) => a + t.amount, 0);
        return { ok: true, result: {
          quantidade: rows.length, soma: Math.round(total * 100) / 100,
          lancamentos: rows.map((t) => ({ id: t.id, data: t.date, valor: t.amount, descricao: t.description, conta: t.account_name, categoria: t.category_name, tipo: t.kind, parcela: t.installment_total ? `${t.installment_n}/${t.installment_total}` : undefined, fatura: t.invoice_month?.slice(0, 7) })),
        } };
      }
      case 'faturas': {
        const { cartao } = FaturasSchema.parse(rawInput ?? {});
        const cards = (await listAccounts()).filter((a) => a.kind === 'credit_card' && (!cartao || a.name.toLowerCase().includes(cartao.toLowerCase())));
        const [summaries, commitments] = await Promise.all([invoiceSummaries(), futureCommitments()]);
        return { ok: true, result: {
          cartoes: cards.map((c) => {
            const open = openInvoiceMonth(c.closing_day ?? 31);
            const { closes, due } = invoiceDates(open, c.closing_day!, c.due_day!);
            return {
              cartao: c.name, fechamento_dia: c.closing_day, vencimento_dia: c.due_day, limite: c.credit_limit,
              fatura_aberta: { mes: open, fecha_em: closes, vence_em: due, total: summaries.find((s) => s.account_id === c.id && s.invoice_month === open)?.total ?? 0 },
              faturas: summaries.filter((s) => s.account_id === c.id).map((s) => ({ mes: s.invoice_month, total: s.total, compras: s.count })),
            };
          }),
          parcelas_futuras: commitments,
        } };
      }
      case 'serie_mensal': {
        const { meses } = SerieSchema.parse(rawInput ?? {});
        return { ok: true, result: await monthlySeries(meses ?? 12) };
      }
      case 'orcamento': {
        const { mes } = MesSchema.parse(rawInput ?? {});
        const b = await getBudgetStatus(mes ?? currentMonth());
        return { ok: true, result: {
          mes: b.month, base: b.base, origem_da_base: b.baseSource, aviso_a_partir_de: `${Math.round(b.threshold * 100)}%`, soma_percentuais: b.totalPercent,
          grupos: b.groups.map((g) => ({ grupo: g.group.name, percentual: g.group.percent, mede: g.group.basis === 'investment' ? 'aportes' : 'gastos', categorias: g.categories.map((c) => c.name), limite: g.limit, usado: g.spent, fracao: Math.round(g.pct * 100) / 100, situacao: g.status })),
          fora_dos_grupos: b.unassigned.spent,
          alertas: b.alerts.map((a) => `${a.title}: ${a.detail}`),
        } };
      }
      case 'viagens': {
        const trips = await listTrips();
        const statuses = await Promise.all(trips.map((t) => tripStatus(t)));
        return { ok: true, result: statuses.map((s) => ({
          viagem: s.trip.name, ida: s.trip.start_date, volta: s.trip.end_date, teto: s.trip.budget, fase: s.phase,
          gasto_no_teto: s.spent, fracao: Math.round(s.pct * 100) / 100, situacao: s.status,
          dias: { total: s.daysTotal, passados: s.daysElapsed, restantes: s.daysLeft }, por_dia_ate_agora: s.perDaySoFar, por_dia_permitido: s.perDayAllowed,
          pre_pago_fora_do_teto: s.prepaid,
          gastos: s.expenses.slice(0, 50).map((t) => ({ data: t.date, descricao: t.description, valor: t.amount, categoria: t.category_name })),
        })) };
      }
      case 'investimentos': {
        const [alloc, series] = await Promise.all([latestAllocation(), netWorthSeries()]);
        return { ok: true, result: {
          total: alloc.reduce((a, s) => a + s.balance, 0),
          posicao: alloc.map((s) => ({ conta: s.account_name, ativo: s.asset, classe: s.asset_class, saldo: s.balance, mes: s.month.slice(0, 7) })),
          evolucao: series,
        } };
      }
      case 'criar_viagem': {
        const p = z.object({ nome: z.string().min(1), inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), teto: z.number().nonnegative().optional() }).parse(rawInput);
        if (p.fim < p.inicio) return { ok: false, error: 'A volta não pode ser antes da ida.' };
        const { rows } = await pool.query<{ id: number }>(`INSERT INTO trips (name, start_date, end_date, budget) VALUES ($1,$2,$3,$4) RETURNING id`, [p.nome, p.inicio, p.fim, p.teto ?? 0]);
        const { rowCount } = await pool.query(
          `UPDATE transactions t SET trip_id = $1
           WHERE t.kind = 'expense' AND t.trip_id IS NULL AND t.date BETWEEN $2 AND $3
             AND t.recurring_id IS NULL AND (t.installment_group IS NULL OR t.installment_n = 1)
             AND (t.category_id IS NULL OR t.category_id NOT IN (SELECT id FROM categories WHERE fixed = TRUE))`,
          [rows[0].id, p.inicio, p.fim],
        );
        return { ok: true, result: { viagem: p.nome, id: rows[0].id, teto: p.teto ?? 0, gastos_ja_vinculados: rowCount ?? 0 } };
      }
      case 'definir_orcamento': {
        const p = z.object({ renda_mensal: z.number().positive().optional(), grupo: z.string().optional(), percentual: z.number().min(0).max(100).optional() }).parse(rawInput ?? {});
        if (p.renda_mensal) await setSetting('monthly_income', String(p.renda_mensal));
        let grupo: string | null = null;
        if (p.grupo && p.percentual !== undefined) {
          const groups = await listGroups();
          const target = groups.find((g) => g.name.toLowerCase().includes(p.grupo!.toLowerCase()));
          if (!target) return { ok: false, error: `Grupo não encontrado. Existem: ${groups.map((g) => g.name).join(', ')}.` };
          await pool.query(`UPDATE budget_groups SET percent = $2 WHERE id = $1`, [target.id, p.percentual]);
          grupo = target.name;
        }
        const status = await getBudgetStatus(currentMonth());
        return { ok: true, result: { renda: status.base, grupo_alterado: grupo, soma_percentuais: status.totalPercent, grupos: status.groups.map((g) => ({ nome: g.group.name, percentual: g.group.percent, limite: g.limit })) } };
      }
      case 'registrar_lancamento': {
        const p = RegistrarSchema.parse(rawInput);
        const account = await findAccountByName(p.conta);
        if (!account) return { ok: false, error: `Conta "${p.conta}" não encontrada. Contas: ${(await listAccounts()).map((a) => a.name).join(', ')}.` };
        const category = p.categoria ? await findCategoryByName(p.categoria) : null;
        const kind: TxKind = p.tipo ?? 'expense';
        const amount = kind === 'expense' ? -p.valor : kind === 'income' ? p.valor : account.kind === 'investment' ? p.valor : -p.valor;
        const created = await createTransaction({ accountId: account.id, date: p.data, amount, description: p.descricao, categoryId: category?.id ?? null, kind, source: 'chat', installments: p.parcelas ?? 1 });
        return { ok: true, result: { registrado: created.map((t) => ({ id: t.id, data: t.date, valor: t.amount, descricao: t.description, conta: t.account_name, categoria: t.category_name, fatura: t.invoice_month?.slice(0, 7) })) } };
      }
      default:
        return { ok: false, error: `Ferramenta desconhecida: ${name}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function buildSystemPrompt(): Promise<string> {
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);
  const accountLines = accounts.map((a) => `- ${a.name} (${a.kind === 'checking' ? 'conta corrente' : a.kind === 'credit_card' ? `cartão, fecha dia ${a.closing_day}, vence dia ${a.due_day}` : 'investimentos'})`).join('\n');
  const catLines = categories.map((c) => `${c.name} (${c.kind === 'income' ? 'receita' : 'gasto'})`).join(', ');
  return `Você é o assistente financeiro pessoal do dono deste sistema, chamado Bússola. Responda em português do Brasil, direto e curto, como um amigo que entende de finanças. Use as ferramentas para buscar números reais antes de afirmar qualquer valor; nunca invente ou estime números que a ferramenta poderia dar. Valores em R$ no formato brasileiro (R$ 1.234,56).

Como o sistema funciona:
- Gasto no cartão conta na data da compra e cai na fatura que fecha depois dessa data. Parcelas viram uma linha por fatura.
- "Transferência" é dinheiro entre contas do próprio usuário (pagamento de fatura, aporte em investimento): nunca é gasto nem receita.
- O usuário registra gastos no dia a dia e importa o extrato na virada do mês; o sistema concilia os dois.
- Viagens têm teto próprio: gasto nas datas da viagem (fora categorias fixas) entra no teto e sai dos grupos do orçamento mensal; pré-pago (passagem etc.) fica fora do teto. Use a ferramenta viagens.
- Você pode criar viagem com teto e ajustar renda/percentual do orçamento quando o usuário pedir (ferramentas criar_viagem e definir_orcamento). Confirme o que fez em uma frase.
- Há um orçamento por percentual da renda (grupos como necessidades, lazer, educação, investimentos). Use a ferramenta orcamento para perguntas sobre limite, meta ou "posso gastar".

Contas cadastradas:
${accountLines || '- nenhuma'}

Categorias: ${catLines || 'nenhuma'}

Hoje é ${todayISO()}. Quando o usuário pedir uma análise, traga o número, a comparação (média, mês anterior) e uma conclusão prática em uma ou duas frases. Só registre lançamentos quando ele pedir claramente. Não use travessão (—) no texto.`;
}
