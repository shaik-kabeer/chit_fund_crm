import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as paymentService from '@/server/services/payment.service';

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR', 'ACCOUNTANT']);
    const data = await paymentService.verifyPayment(params.id, user.id, user.orgId);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
