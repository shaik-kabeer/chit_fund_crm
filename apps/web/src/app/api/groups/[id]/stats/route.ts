import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as groupService from '@/server/services/group.service';

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT']);
    const data = await groupService.getStats(user.orgId, params.id);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
