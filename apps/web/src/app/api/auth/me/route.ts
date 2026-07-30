import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireAuth } from '@/server/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    return json(user);
  } catch (e) {
    return handleRouteError(e);
  }
}
