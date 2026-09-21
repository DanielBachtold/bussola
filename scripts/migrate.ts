/**
 * Cria o schema do zero ou aplica só o que falta. Idempotente: pode rodar
 * quantas vezes quiser, nunca apaga nada.
 * Uso: npm run migrate
 */
import { Pool } from 'pg';

try {
  process.loadEnvFile('.env.local');
} catch {
  // sem .env.local: DATABASE_URL precisa vir do shell
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL não definida. Crie .env.local a partir de .env.example.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});

const statements = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('checking','credit_card','investment')),
    institution TEXT,
    closing_day INT CHECK (closing_day BETWEEN 1 AND 31),
    due_day INT CHECK (due_day BETWEEN 1 AND 31),
    credit_limit NUMERIC(14,2),
    balance NUMERIC(14,2),
    balance_at DATE,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('expense','income')),
    icon TEXT,
    budget NUMERIC(14,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount NUMERIC(14,2) NOT NULL,
    description TEXT NOT NULL,
    category_id INT REFERENCES categories(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('expense','income','transfer')),
    source TEXT NOT NULL CHECK (source IN ('manual','import','chat')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reconciled','imported')),
    reviewed BOOLEAN NOT NULL DEFAULT TRUE,
    fitid TEXT,
    statement_description TEXT,
    invoice_month DATE,
    installment_group UUID,
    installment_n INT,
    installment_total INT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS transactions_account_fitid ON transactions(account_id, fitid) WHERE fitid IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS transactions_date ON transactions(date)`,
  `CREATE INDEX IF NOT EXISTS transactions_invoice ON transactions(account_id, invoice_month)`,
  `CREATE TABLE IF NOT EXISTS category_rules (
    id SERIAL PRIMARY KEY,
    pattern TEXT NOT NULL,
    category_id INT REFERENCES categories(id) ON DELETE CASCADE,
    kind TEXT CHECK (kind IN ('expense','income','transfer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS investment_snapshots (
    id SERIAL PRIMARY KEY,
    account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    asset_class TEXT,
    month DATE NOT NULL,
    balance NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, asset, month)
  )`,
  `CREATE TABLE IF NOT EXISTS imports (
    id SERIAL PRIMARY KEY,
    account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    period_start DATE,
    period_end DATE,
    total_lines INT NOT NULL DEFAULT 0,
    matched INT NOT NULL DEFAULT 0,
    inserted INT NOT NULL DEFAULT 0,
    skipped INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS chats (
    id SERIAL PRIMARY KEY,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    chat_id INT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user','assistant')),
    content JSONB NOT NULL,
    display TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS insights (
    id SERIAL PRIMARY KEY,
    month DATE NOT NULL UNIQUE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

const defaultCategories: Array<[string, 'expense' | 'income', string]> = [
  ['Alimentação', 'expense', '🍽️'],
  ['Mercado', 'expense', '🛒'],
  ['Moradia', 'expense', '🏠'],
  ['Transporte', 'expense', '🚗'],
  ['Saúde', 'expense', '💊'],
  ['Lazer', 'expense', '🎬'],
  ['Assinaturas', 'expense', '📱'],
  ['Compras', 'expense', '🛍️'],
  ['Educação', 'expense', '📚'],
  ['Viagem', 'expense', '✈️'],
  ['Impostos e taxas', 'expense', '🧾'],
  ['Pessoal', 'expense', '👤'],
  ['Outros', 'expense', '📦'],
  ['Salário', 'income', '💼'],
  ['Pró-labore', 'income', '🏢'],
  ['Rendimentos', 'income', '📈'],
  ['Reembolso', 'income', '↩️'],
  ['Outras receitas', 'income', '➕'],
];

// Padrões que, no extrato, indicam movimentação entre contas próprias e não gasto.
const defaultTransferRules = [
  'pagamento de fatura',
  'pagamento recebido',
  'pgto fatura',
  'aplicacao',
  'aplicação',
  'resgate',
  'transferencia entre contas',
  'transferência entre contas',
];

async function main() {
  for (const sql of statements) await pool.query(sql);

  for (const [name, kind, icon] of defaultCategories) {
    await pool.query(
      `INSERT INTO categories (name, kind, icon) VALUES ($1,$2,$3) ON CONFLICT (name) DO NOTHING`,
      [name, kind, icon],
    );
  }
  for (const pattern of defaultTransferRules) {
    const { rows } = await pool.query(`SELECT 1 FROM category_rules WHERE pattern = $1 AND kind = 'transfer'`, [pattern]);
    if (rows.length === 0) {
      await pool.query(`INSERT INTO category_rules (pattern, kind) VALUES ($1, 'transfer')`, [pattern]);
    }
  }

  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log(`Tabelas: ${rows.map((r) => r.table_name).join(', ')}`);
  console.log('Migração concluída.');
  await pool.end();
}

main().catch((err) => {
  console.error('Erro ao rodar a migração:', err);
  process.exit(1);
});
