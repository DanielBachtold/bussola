'use server';

import { timingSafeEqual } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export async function login(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const expected = process.env.APP_PASSWORD ?? '';
  const given = String(formData.get('password') ?? '');
  if (!expected) return { error: 'APP_PASSWORD não configurada no servidor.' };
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return { error: 'Senha incorreta.' };
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
