import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as groupService from '@/server/services/group.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const data = await groupService.getAvailable(user.orgId);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
