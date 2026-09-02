import { NextRequest } from 'next/server';
import { submitPaymentSchema } from '@chitfund/shared';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as paymentService from '@/server/services/payment.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await parseBody(submitPaymentSchema, request);
    const data = await paymentService.submitPayment({
      ...body,
      customerId: user.type === 'customer' ? user.id : undefined,
      collectedById: user.type === 'staff' ? user.id : undefined,
    } as Parameters<typeof paymentService.submitPayment>[0]);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
