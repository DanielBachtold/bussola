import { NextResponse, type NextRequest } from 'next/server';
import { unsealData } from 'iron-session';

const SESSION_COOKIE = 'bussola_session';
const SESSION_TTL = 60 * 60 * 24 * 30;

/**
 * Valida o selo da sessão em toda requisição de página. Cookie ausente,
 * inválido ou vencido: vai pro login (e o cookie ruim é apagado, senão
 * login e app ficariam se redirecionando um pro outro). Cada página ainda
 * chama requireSession(), porque numa navegação suave o layout não roda.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const seal = request.cookies.get(SESSION_COOKIE)?.value;
  const loggedIn = seal ? await isValidSeal(seal) : false;

  if (pathname === '/login') {
    return loggedIn ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (!loggedIn) {
    const res = NextResponse.redirect(new URL('/login', request.url));
    if (seal) res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  return NextResponse.next();
}

async function isValidSeal(seal: string): Promise<boolean> {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) return false;
  try {
    const data = await unsealData<{ loggedIn?: boolean }>(seal, { password, ttl: SESSION_TTL });
    return data?.loggedIn === true;
  } catch {
    return false;
  }
}

export const config = {
  // tudo, menos rotas de API e arquivos estáticos (qualquer caminho com extensão: .js, .png, .webmanifest...)
  matcher: ['/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)'],
};
