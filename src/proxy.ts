import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, isLocale, localePath, matchAcceptLanguage, splitLocale } from '@/i18n/locales.mjs';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Language routing. Every page lives under /en, /am, /om or /ar.
 * - A path with a language: remember it (cookie) so server messages and later
 *   links without a language use the same one.
 * - A path without one (old links, bookmarks, redirects): send the visitor to the
 *   language they used last, or else the language their device prefers.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { locale } = splitLocale(pathname);
  if (locale) {
    const response = NextResponse.next();
    if (request.cookies.get(LOCALE_COOKIE)?.value !== locale) {
      response.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: ONE_YEAR, sameSite: 'lax' });
    }
    return response;
  }
  const remembered = request.cookies.get(LOCALE_COOKIE)?.value;
  const target = isLocale(remembered) ? remembered : matchAcceptLanguage(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = localePath(target, pathname);
  url.search = search;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Pages only: not API routes, Next.js internals or files such as /images/x.png.
  matcher: ['/((?!api/|_next/|.*\\.[A-Za-z0-9]+$).*)'],
};
