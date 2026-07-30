import { NextRequest } from 'next/server';
import { json, handleRouteError, readJson } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as membershipService from '@/server/services/membership.service';

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth(request);
    const body = await readJson<{ seatLabel: string }>(request);
    if (user.type === 'customer') {
      const data = await membershipService.updateSeatLabel(params.id, body.seatLabel, user.id);
      return json(data);
    }
    const data = await membershipService.updateSeatLabel(params.id, body.seatLabel, undefined, user.orgId);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
