import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireCustomer } from '@/server/auth';
import * as membershipService from '@/server/services/membership.service';

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireCustomer(request);
    const membership = await membershipService.getMembershipDetail(params.id, user.id);
    const { ticketNumber: _ticketNumber, ...memberSafe } = membership;
    return json(memberSafe);
  } catch (e) {
    return handleRouteError(e);
  }
}
