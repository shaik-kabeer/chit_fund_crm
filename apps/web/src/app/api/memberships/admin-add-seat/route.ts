import { NextRequest } from 'next/server';
import { adminAddSeatSchema } from '@chitfund/shared';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as membershipService from '@/server/services/membership.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await parseBody(adminAddSeatSchema, request);
    const data = await membershipService.adminAddSeat(user.orgId, {
      groupId: body.groupId,
      customerId: body.customerId,
      seatLabel: body.seatLabel,
      approvedById: user.id,
    });
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
