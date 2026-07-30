import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as paymentService from '@/server/services/payment.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR', 'ACCOUNTANT']);
    const { searchParams } = request.nextUrl;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const limit = searchParams.get('limit')
      ? Math.min(parseInt(searchParams.get('limit')!, 10) || 20, 100)
      : 20;
    const data = await paymentService.getPendingPayments(user.orgId, page, limit);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
