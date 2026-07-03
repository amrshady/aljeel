import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const localePattern = routing.locales.join('|');
  const localeRoot = new RegExp(`^/(${localePattern})/?$`);

  const match = pathname.match(localeRoot);
  if (match) {
    return NextResponse.redirect(new URL(`/${match[1]}/dashboard`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/', '/(ar|en)/:path*'],
};
