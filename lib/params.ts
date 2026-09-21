/** Parâmetros de URL: inteiro positivo ou nada. "1.5", "abc" e "1e400" viram undefined em vez de erro do Postgres. */
export function intParam(v: unknown): number | undefined {
  if (typeof v !== 'string' || !/^\d{1,9}$/.test(v)) return undefined;
  const n = Number(v);
  return n > 0 ? n : undefined;
}

export function monthParam(v: unknown): string | undefined {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : undefined;
}
