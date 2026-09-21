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
  `CREATE TABLE IF NOT EXISTS budget_groups (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    percent NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
    basis TEXT NOT NULL DEFAULT 'expense' CHECK (basis IN ('expense','investment')),
    sort INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_id INT REFERENCES budget_groups(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL CHECK (end_date >= start_date),
    budget NUMERIC(14,2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS trip_id INT REFERENCES trips(id) ON DELETE SET NULL`,
  `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS trip_excluded BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE INDEX IF NOT EXISTS transactions_trip ON transactions(trip_id)`,
  `ALTER TABLE categories ADD COLUMN IF NOT EXISTS fixed BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    ip TEXT PRIMARY KEY,
    fails INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  // padrão repetido criaria regras conflitantes; remove duplicatas antes de travar
  `DELETE FROM category_rules a USING category_rules b WHERE a.pattern = b.pattern AND a.id > b.id`,
  `CREATE UNIQUE INDEX IF NOT EXISTS category_rules_pattern ON category_rules(pattern)`,
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

// Grupos de orçamento por percentual da renda (o usuário ajusta em Configurações).
const defaultGroups: Array<[string, number, 'expense' | 'investment', string[]]> = [
  ['Necessidades básicas', 40, 'expense', ['Moradia', 'Mercado', 'Saúde', 'Transporte', 'Impostos e taxas']],
  ['Lazer e estilo de vida', 15, 'expense', ['Lazer', 'Alimentação', 'Viagem', 'Assinaturas', 'Compras', 'Pessoal']],
  ['Educação', 15, 'expense', ['Educação']],
  ['Investimentos', 30, 'investment', []],
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

  // categorias "fixas": contas que continuam vindo mesmo em viagem (não entram no teto da viagem)
  const { rows: fixedFlag } = await pool.query(`SELECT value FROM settings WHERE key = 'fixed_defaults_applied'`);
  if (!fixedFlag.length) {
    await pool.query(`UPDATE categories SET fixed = TRUE WHERE name = ANY($1)`, [['Moradia', 'Impostos e taxas', 'Assinaturas', 'Educação']]);
    await pool.query(`INSERT INTO settings (key, value) VALUES ('fixed_defaults_applied', '1') ON CONFLICT DO NOTHING`);
  }

  const { rows: groupCount } = await pool.query(`SELECT COUNT(*)::int AS n FROM budget_groups`);
  if (groupCount[0].n === 0) {
    for (const [i, [name, percent, basis, cats]] of defaultGroups.entries()) {
      const { rows: g } = await pool.query(`INSERT INTO budget_groups (name, percent, basis, sort) VALUES ($1,$2,$3,$4) RETURNING id`, [name, percent, basis, i]);
      if (cats.length) await pool.query(`UPDATE categories SET group_id = $1 WHERE name = ANY($2) AND group_id IS NULL`, [g[0].id, cats]);
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
