import { NextRequest } from 'next/server';
import { json, handleRouteError, readJson } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as groupService from '@/server/services/group.service';

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await readJson<{ status: string }>(request);
    const data = await groupService.updateStatus(user.orgId, params.id, body.status);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
