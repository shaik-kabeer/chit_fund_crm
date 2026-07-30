import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as membershipService from '@/server/services/membership.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR']);
    const data = await membershipService.getPendingRequests(user.orgId);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
