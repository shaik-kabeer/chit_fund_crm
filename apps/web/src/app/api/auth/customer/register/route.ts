import { NextRequest, NextResponse } from 'next/server';
import { customerRegisterSchema } from '@chitfund/shared';
import { ApiError, handleRouteError, parseBody } from '@/server/http';
import { rateLimit } from '@/server/rate-limit';
import { setRefreshCookie } from '@/server/auth';
import * as authService from '@/server/services/auth.service';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const { success } = rateLimit(`auth:${ip}`, 5, 60_000);
    if (!success) throw new ApiError(429, 'Too many attempts. Please try again later.');

    const body = await parseBody(customerRegisterSchema, request);
    const orgId = await authService.resolveRegistrationOrgId(process.env.DEFAULT_ORG_ID);
    const { user, tokens } = await authService.customerRegister({ ...body, orgId });
    const response = NextResponse.json({ user, accessToken: tokens.accessToken });
    setRefreshCookie(response, tokens.refreshToken);
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}
