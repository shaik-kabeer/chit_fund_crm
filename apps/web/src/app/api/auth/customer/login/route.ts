import { NextRequest, NextResponse } from 'next/server';
import { customerLoginSchema } from '@chitfund/shared';
import { ApiError, handleRouteError, parseBody } from '@/server/http';
import { rateLimit } from '@/server/rate-limit';
import { setRefreshCookie } from '@/server/auth';
import * as authService from '@/server/services/auth.service';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const { success } = rateLimit(`auth:${ip}`, 5, 60_000);
    if (!success) throw new ApiError(429, 'Too many attempts. Please try again later.');

    const body = await parseBody(customerLoginSchema, request);
    const { user, tokens } = await authService.customerLogin(body.phone, body.password);
    const response = NextResponse.json({ user, accessToken: tokens.accessToken });
    setRefreshCookie(response, tokens.refreshToken);
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}
