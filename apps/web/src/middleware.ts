import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes and static files
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Auth pages should redirect to appropriate dashboard if already logged in
  // (Can't fully validate JWT in edge middleware without jose, but we can check cookie presence)

  // For admin pages: if no access token cookie/header is present, we rely on client-side redirect
  // This is a light guard - the real auth is on API routes

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
