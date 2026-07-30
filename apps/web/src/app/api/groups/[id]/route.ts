import { NextRequest } from 'next/server';
import { json, handleRouteError, readJson } from '@/server/http';
import { requireAuth, requireStaff } from '@/server/auth';
import * as groupService from '@/server/services/group.service';

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth(request);
    const data = await groupService.findById(user.orgId, params.id);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await readJson<{
      groupNumber?: string;
      agreementNo?: string;
      startDate?: string;
      branchId?: string | null;
    }>(request);
    const data = await groupService.update(user.orgId, params.id, body);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
