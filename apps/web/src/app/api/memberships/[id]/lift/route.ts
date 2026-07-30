import { NextRequest } from 'next/server';
import { json, handleRouteError, readJson } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as membershipService from '@/server/services/membership.service';

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await readJson<{ monthNumber?: number }>(request);
    const data = await membershipService.markAsLifted(params.id, user.orgId, user.id, body?.monthNumber);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
