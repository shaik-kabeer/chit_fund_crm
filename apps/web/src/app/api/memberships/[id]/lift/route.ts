import { NextRequest } from 'next/server';
import { liftMemberSchema } from '@chitfund/shared';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as membershipService from '@/server/services/membership.service';

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await parseBody(liftMemberSchema, request);
    const data = await membershipService.markAsLifted(params.id, user.orgId, user.id, body.monthNumber);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
