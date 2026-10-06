import { NextResponse, type NextRequest } from 'next/server';
import { hasAppSession, privateAppEnabled } from './server/app-access';
export function proxy(request: NextRequest) {
  if (!privateAppEnabled()) return NextResponse.next();
  const cookie =
    request.cookies.get('stillform-integration-session')?.value ??
    request.cookies.get('stillform-gym-session')?.value;
  if (hasAppSession(cookie, process.env.INTEGRATION_ENCRYPTION_KEY || '')) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const target = new URL('/login', request.url);
  target.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(target);
}
export const config = {
  matcher: [
    '/',
    '/gym/:path*',
    '/running/:path*',
    '/recovery/:path*',
    '/plan/:path*',
    '/integrations/:path*',
    '/activities/:path*',
  ],
};
