import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as membershipService from '@/server/services/membership.service';

type RouteContext = { params: { groupId: string } };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const data = await membershipService.activateApproved(params.groupId, user.orgId);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
