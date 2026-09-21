export type AccountKind = 'checking' | 'credit_card' | 'investment';
export type TxKind = 'expense' | 'income' | 'transfer';
export type TxSource = 'manual' | 'import' | 'chat';
export type TxStatus = 'pending' | 'reconciled' | 'imported';

export type Account = {
  id: number;
  name: string;
  kind: AccountKind;
  institution: string | null;
  closing_day: number | null;
  due_day: number | null;
  credit_limit: number | null;
  balance: number | null;
  balance_at: string | null;
  archived: boolean;
  ofx_acctid: string | null;
};

export type Category = {
  id: number;
  name: string;
  kind: 'expense' | 'income';
  icon: string | null;
  budget: number | null;
  group_id: number | null;
  fixed: boolean;
};

export type Trip = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  budget: number;
  notes: string | null;
};

export type BudgetGroup = {
  id: number;
  name: string;
  percent: number;
  basis: 'expense' | 'investment';
  sort: number;
};

export type Rule = {
  id: number;
  pattern: string;
  category_id: number | null;
  kind: TxKind | null;
  category_name?: string | null;
};

export type Transaction = {
  id: number;
  account_id: number;
  date: string;
  amount: number;
  description: string;
  category_id: number | null;
  kind: TxKind;
  source: TxSource;
  status: TxStatus;
  reviewed: boolean;
  fitid: string | null;
  statement_description: string | null;
  invoice_month: string | null;
  installment_group: string | null;
  installment_n: number | null;
  installment_total: number | null;
  notes: string | null;
  trip_id: number | null;
  trip_excluded: boolean;
  trip_name: string | null;
  recurring_id: number | null;
  import_id: number | null;
  reconciled_import_id: number | null;
  account_name: string;
  account_kind: AccountKind;
  category_name: string | null;
  category_icon: string | null;
};

export type Snapshot = {
  id: number;
  account_id: number;
  account_name: string;
  asset: string;
  asset_class: string | null;
  month: string;
  balance: number;
};

export const KIND_LABEL: Record<AccountKind, string> = {
  checking: 'Conta corrente',
  credit_card: 'Cartão de crédito',
  investment: 'Investimentos',
};

export const TX_KIND_LABEL: Record<TxKind, string> = {
  expense: 'Gasto',
  income: 'Receita',
  transfer: 'Transferência',
};

export type RecurringRule = {
  id: number;
  description: string;
  amount: number;
  account_id: number;
  category_id: number | null;
  kind: TxKind;
  day_of_month: number;
  active: boolean;
  last_posted_month: string | null;
  account_name?: string;
  category_name?: string | null;
  category_icon?: string | null;
};
