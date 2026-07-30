import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireCustomer } from '@/server/auth';
import * as membershipService from '@/server/services/membership.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const memberships = await membershipService.getMyMemberships(user.id);
    return json(
      memberships.map(({ ticketNumber: _ticketNumber, ...membership }) => membership),
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
