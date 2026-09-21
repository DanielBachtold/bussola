/**
 * Postgres local sem instalar nada: roda o PGlite (Postgres em WASM) e expõe
 * na porta 5433 falando o protocolo do Postgres. Os dados ficam em ./dados/pglite
 * (ignorado pelo git). Use só em desenvolvimento; em produção, Neon/Supabase.
 *
 *   npm run db:local
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { mkdirSync } from 'node:fs';

const port = Number(process.env.PGLITE_PORT ?? 5433);
mkdirSync('./dados/pglite', { recursive: true });
const db = await PGlite.create({ dataDir: './dados/pglite' });
const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 20 });
await server.start();
console.log(`PGlite ouvindo em postgres://postgres:postgres@localhost:${port}/postgres`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await server.stop(); await db.close(); process.exit(0); });
}
