import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as analyticsService from '@/server/services/analytics.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const data = await analyticsService.getAnalytics(user.orgId);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
