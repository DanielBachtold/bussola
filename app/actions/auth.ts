'use server';

import { timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';

const MAX_FAILS = 5;

/** Bloqueio progressivo por IP: 5 erros = 15 min, e dobra a cada erro seguinte (teto de 24 h). */
async function checkLock(ip: string): Promise<string | null> {
  const { rows } = await pool.query<{ locked_until: string | null }>(`SELECT locked_until FROM login_attempts WHERE ip = $1 AND locked_until > NOW()`, [ip]);
  if (!rows[0]) return null;
  const minutes = Math.max(1, Math.ceil((new Date(rows[0].locked_until!).getTime() - Date.now()) / 60000));
  return `Muitas tentativas. Tente de novo em ${minutes} min.`;
}

async function registerFail(ip: string) {
  await pool.query(
    `INSERT INTO login_attempts (ip, fails, locked_until, updated_at) VALUES ($1, 1, NULL, NOW())
     ON CONFLICT (ip) DO UPDATE SET
       fails = CASE WHEN login_attempts.updated_at < NOW() - INTERVAL '1 day' THEN 1 ELSE login_attempts.fails + 1 END,
       updated_at = NOW()`,
    [ip],
  );
  await pool.query(
    `UPDATE login_attempts SET locked_until = NOW() + LEAST(INTERVAL '24 hours', INTERVAL '15 minutes' * POWER(2, GREATEST(fails - $2, 0)))
     WHERE ip = $1 AND fails >= $2`,
    [ip, MAX_FAILS],
  );
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const expected = process.env.APP_PASSWORD ?? '';
  const given = String(formData.get('password') ?? '');
  if (!expected) return { error: 'APP_PASSWORD não configurada no servidor.' };
  const ip = await clientIp();
  const locked = await checkLock(ip);
  if (locked) return { error: locked };
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    await registerFail(ip);
    return { error: 'Senha incorreta.' };
  }
  await pool.query(`DELETE FROM login_attempts WHERE ip = $1`, [ip]);
  const session = await getSession();
  session.loggedIn = true;
  await session.save();
  redirect('/');
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect('/login');
}
