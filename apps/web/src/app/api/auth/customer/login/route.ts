import { NextRequest, NextResponse } from 'next/server';
import { handleRouteError, readJson } from '@/server/http';
import { setRefreshCookie } from '@/server/auth';
import * as authService from '@/server/services/auth.service';

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{ phone: string; password: string }>(request);
    const { user, tokens } = await authService.customerLogin(body.phone, body.password);
    const response = NextResponse.json({ user, accessToken: tokens.accessToken });
    setRefreshCookie(response, tokens.refreshToken);
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}
