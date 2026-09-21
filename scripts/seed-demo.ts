/**
 * Dados FICTÍCIOS para quem clonar o projeto testar. Nunca use em produção
 * com seus dados de verdade: ele cria contas e lançamentos inventados.
 * Uso: npm run seed:demo
 */
import { Pool } from 'pg';

try { process.loadEnvFile('.env.local'); } catch { /* sem .env.local */ }

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error('DATABASE_URL não definida.'); process.exit(1); }
const pool = new Pool({ connectionString, ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false } });

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function rand(min: number, max: number) { return Math.round((min + Math.random() * (max - min)) * 100) / 100; }

async function main() {
  const { rows: existing } = await pool.query(`SELECT COUNT(*)::int AS n FROM accounts`);
  if (existing[0].n > 0) { console.error('Já existem contas no banco. O seed de demonstração só roda em banco vazio.'); process.exit(1); }

  const acc = async (name: string, kind: string, extra: Record<string, unknown> = {}) => {
    const { rows } = await pool.query(
      `INSERT INTO accounts (name, kind, institution, closing_day, due_day, credit_limit, balance, balance_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [name, kind, extra.institution ?? null, extra.closing_day ?? null, extra.due_day ?? null, extra.credit_limit ?? null, extra.balance ?? null, extra.balance_at ?? null],
    );
    return rows[0].id as number;
  };
  const checking = await acc('Banco Exemplo', 'checking', { institution: 'exemplo', balance: 4820.55, balance_at: iso(new Date()) });
  const card = await acc('Cartão Exemplo', 'credit_card', { institution: 'exemplo', closing_day: 25, due_day: 5, credit_limit: 8000 });
  const broker = await acc('Corretora Exemplo', 'investment', { institution: 'corretora' });

  const { rows: cats } = await pool.query<{ id: number; name: string }>(`SELECT id, name FROM categories`);
  const cat = (n: string) => cats.find((c) => c.name === n)?.id ?? null;

  const merchants: Array<[string, string, number, number, 'card' | 'checking']> = [
    ['iFood', 'Alimentação', 35, 90, 'card'], ['Restaurante Central', 'Alimentação', 45, 140, 'card'], ['Padaria Bom Dia', 'Alimentação', 12, 40, 'card'],
    ['Supermercado Boa Compra', 'Mercado', 120, 480, 'card'], ['Uber', 'Transporte', 14, 48, 'card'], ['Posto Estrela', 'Transporte', 150, 300, 'card'],
    ['Farmácia Vida', 'Saúde', 30, 180, 'card'], ['Netflix', 'Assinaturas', 55.9, 55.9, 'card'], ['Spotify', 'Assinaturas', 21.9, 21.9, 'card'],
    ['Cinema', 'Lazer', 40, 90, 'card'], ['Loja de Roupas', 'Compras', 90, 350, 'card'], ['Aluguel', 'Moradia', 2200, 2200, 'checking'],
    ['Conta de luz', 'Moradia', 180, 320, 'checking'], ['Internet', 'Moradia', 129.9, 129.9, 'checking'], ['Academia', 'Saúde', 119, 119, 'checking'],
  ];

  const today = new Date();
  for (let m = 5; m >= 0; m--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const lastDay = m === 0 ? today.getDate() : daysInMonth;

    // salário dia 5
    await insertTx(checking, iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 5)), 9500, 'Salário', cat('Salário'), 'income');
    // aporte dia 6: sai da conta, entra na corretora
    await insertTx(checking, iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 6)), -1500, 'Aplicação Corretora Exemplo', null, 'transfer');
    await insertTx(broker, iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 6)), 1500, 'Aporte', null, 'transfer');
    // pagamento da fatura dia 5
    if (m < 5) await insertTx(checking, iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), 5)), -rand(2200, 3400), 'Pagamento de fatura Cartão Exemplo', null, 'transfer');

    for (const [name, category, min, max, where] of merchants) {
      const times = ['Aluguel', 'Conta de luz', 'Internet', 'Academia', 'Netflix', 'Spotify', 'Posto Estrela'].includes(name) ? 1 : 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < times; i++) {
        const day = 1 + Math.floor(Math.random() * lastDay);
        const date = iso(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
        const accountId = where === 'card' ? card : checking;
        await insertTx(accountId, date, -rand(min, max), name, cat(category), 'expense', accountId === card ? 25 : null);
      }
    }
    // posição de investimentos no fim do mês
    const base = 42000 + (5 - m) * 1650 + Math.random() * 400;
    const month = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`;
    await pool.query(`INSERT INTO investment_snapshots (account_id, asset, asset_class, month, balance) VALUES ($1,'Tesouro Selic','Renda fixa',$2,$3) ON CONFLICT DO NOTHING`, [broker, month, Math.round(base * 0.55)]);
    await pool.query(`INSERT INTO investment_snapshots (account_id, asset, asset_class, month, balance) VALUES ($1,'CDB 110% CDI','Renda fixa',$2,$3) ON CONFLICT DO NOTHING`, [broker, month, Math.round(base * 0.25)]);
    await pool.query(`INSERT INTO investment_snapshots (account_id, asset, asset_class, month, balance) VALUES ($1,'ETF IVVB11','Exterior',$2,$3) ON CONFLICT DO NOTHING`, [broker, month, Math.round(base * 0.2)]);
  }

  // uma compra parcelada em 10x no cartão, há 2 meses
  const purchase = new Date(today.getFullYear(), today.getMonth() - 2, 12);
  const group = crypto.randomUUID();
  for (let i = 0; i < 10; i++) {
    const d = new Date(purchase.getFullYear(), purchase.getMonth() + i, 12);
    await insertTx(card, iso(d), -249.9, `Notebook (${i + 1}/10)`, cat('Compras'), 'expense', 25, { group, n: i + 1, total: 10 });
  }

  // alguns lançamentos importados sem revisão, pra fila de Revisar ter conteúdo
  for (const [name, val] of [['PAG*LojaDesconhecida', -87.3], ['MERCPAGO*XYZ', -45], ['TARIFA MENSAL', -19.9]] as Array<[string, number]>) {
    await pool.query(
      `INSERT INTO transactions (account_id, date, amount, description, kind, source, status, reviewed, fitid, statement_description, invoice_month)
       VALUES ($1,$2,$3,$4,'expense','import','imported',FALSE,$5,$4,$6)`,
      [card, iso(new Date(today.getFullYear(), today.getMonth(), Math.max(1, today.getDate() - 3))), val, name, `demo-${name}`, invoiceMonth(iso(new Date(today.getFullYear(), today.getMonth(), Math.max(1, today.getDate() - 3))), 25)],
    );
  }

  const { rows: count } = await pool.query(`SELECT COUNT(*)::int AS n FROM transactions`);
  console.log(`Seed de demonstração criado: 3 contas, ${count[0].n} lançamentos, 6 meses de posições.`);
  await pool.end();
}

function invoiceMonth(dateISO: string, closingDay: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const next = d > closingDay ? new Date(y, m, 1) : new Date(y, m - 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
}

async function insertTx(accountId: number, date: string, amount: number, description: string, categoryId: number | null, kind: string, closingDay: number | null = null, inst?: { group: string; n: number; total: number }) {
  await pool.query(
    `INSERT INTO transactions (account_id, date, amount, description, category_id, kind, source, status, reviewed, invoice_month, installment_group, installment_n, installment_total)
     VALUES ($1,$2,$3,$4,$5,$6,'manual','reconciled',TRUE,$7,$8,$9,$10)`,
    [accountId, date, amount, description, categoryId, kind, closingDay ? invoiceMonth(date, closingDay) : null, inst?.group ?? null, inst?.n ?? null, inst?.total ?? null],
  );
}

main().catch((err) => { console.error(err); process.exit(1); });
