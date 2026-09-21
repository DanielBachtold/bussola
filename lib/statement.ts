/** Formato comum de uma linha de extrato, seja de OFX ou CSV. */
export type StatementLine = {
  fitid: string | null;
  date: string; // YYYY-MM-DD
  amount: number; // negativo = saída, positivo = entrada
  description: string;
};

export type ParsedStatement = {
  format: 'ofx' | 'csv';
  accountKind: 'checking' | 'credit_card' | 'unknown';
  lines: StatementLine[];
  periodStart: string | null;
  periodEnd: string | null;
  balance: number | null;
  balanceDate: string | null;
  /** número da conta/cartão no arquivo (ACCTID): serve pra reconhecer a conta certa */
  acctId?: string | null;
};
