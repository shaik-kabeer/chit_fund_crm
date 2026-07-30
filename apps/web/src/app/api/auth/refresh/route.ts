import { NextResponse } from 'next/server';
import { ApiError, handleRouteError } from '@/server/http';
import { getRefreshPayloadFromCookies, setRefreshCookie } from '@/server/auth';
import * as authService from '@/server/services/auth.service';

export async function POST() {
  try {
    const payload = await getRefreshPayloadFromCookies();
    if (!payload) throw new ApiError(401, 'Unauthorized');
    const tokens = await authService.refreshTokens(payload);
    const response = NextResponse.json({ accessToken: tokens.accessToken });
    setRefreshCookie(response, tokens.refreshToken);
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}
