import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'bussola_session';

// Só checa a presença do cookie (rápido). A validação de verdade acontece em
// requireSession()/sessionOrNull() dentro de cada página e rota.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(SESSION_COOKIE);

  if (pathname === '/login') {
    return hasCookie ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (!hasCookie) {
    const url = new URL('/login', request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|manifest.webmanifest|icon.*|.*\\.png$|.*\\.svg$).*)'],
};
