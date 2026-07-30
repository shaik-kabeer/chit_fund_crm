import { NextResponse } from 'next/server';
import { handleRouteError } from '@/server/http';
import { clearRefreshCookie } from '@/server/auth';

export async function POST() {
  try {
    const response = NextResponse.json({ message: 'Logged out' });
    clearRefreshCookie(response);
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}
