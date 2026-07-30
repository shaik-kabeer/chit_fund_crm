import { NextRequest, NextResponse } from 'next/server';
import { handleRouteError, readJson } from '@/server/http';
import { setRefreshCookie } from '@/server/auth';
import * as authService from '@/server/services/auth.service';

export async function POST(request: NextRequest) {
  try {
    const body = await readJson<{
      phone: string;
      email?: string;
      password: string;
      name: string;
    }>(request);
    const orgId = await authService.resolveRegistrationOrgId(process.env.DEFAULT_ORG_ID);
    const { user, tokens } = await authService.customerRegister({ ...body, orgId });
    const response = NextResponse.json({ user, accessToken: tokens.accessToken });
    setRefreshCookie(response, tokens.refreshToken);
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}
