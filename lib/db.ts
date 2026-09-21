import { Pool, types, type PoolClient } from 'pg';

// DATE vira string ISO (sem fuso) e NUMERIC vira number: evita o clássico
// "dia 1 virou dia 31" e as somas de string.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => parseFloat(v));

declare global {
  var _pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

function createPool() {
  return new Pool({
    connectionString,
    ssl: connectionString?.includes('localhost') || connectionString?.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });
}

export const pool = global._pgPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  global._pgPool = pool;
}

export type Queryable = Pool | PoolClient;

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
