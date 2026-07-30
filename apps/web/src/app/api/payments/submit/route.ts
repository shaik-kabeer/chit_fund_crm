import { NextRequest } from 'next/server';
import { json, handleRouteError, readJson } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as paymentService from '@/server/services/payment.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await readJson(request);
    const data = await paymentService.submitPayment({
      ...body,
      customerId: user.type === 'customer' ? user.id : undefined,
      collectedById: user.type === 'staff' ? user.id : undefined,
    });
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
