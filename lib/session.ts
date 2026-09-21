import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export type SessionData = { loggedIn?: boolean };

export const SESSION_COOKIE = 'bussola_session';

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET precisa ter pelo menos 32 caracteres (openssl rand -base64 32).');
  }
  return {
    password,
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession() {
  const store = await cookies();
  return getIronSession<SessionData>(store, sessionOptions());
}

/** Garante sessão em páginas, actions e rotas. Redireciona pro login se não houver. */
export async function requireSession() {
  const session = await getSession();
  if (!session.loggedIn) redirect('/login');
  return session;
}

/** Versão pra route handlers: devolve null em vez de redirecionar. */
export async function sessionOrNull() {
  const session = await getSession();
  return session.loggedIn ? session : null;
}
