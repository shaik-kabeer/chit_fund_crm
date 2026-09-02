import { NextRequest } from 'next/server';
import { joinGroupSchema } from '@chitfund/shared';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireCustomer } from '@/server/auth';
import * as membershipService from '@/server/services/membership.service';

type RouteContext = { params: { groupId: string } };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireCustomer(request);
    const body = await parseBody(joinGroupSchema, request);
    const data = await membershipService.requestJoin(user.id, params.groupId, user.orgId, {
      seatLabel: body.seatLabel,
      quantity: body.quantity,
    });
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
