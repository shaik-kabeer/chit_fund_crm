import { NextRequest } from 'next/server';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireStaff } from '@/server/auth';
import { markAsPaidSchema } from '@chitfund/shared';
import * as paymentService from '@/server/services/payment.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR', 'ACCOUNTANT']);
    const body = await parseBody(markAsPaidSchema, request);
    const result = await paymentService.markAsPaid({
      installmentId: body.installmentId,
      amountPaise: body.amountPaise,
      method: body.method,
      paymentDate: body.paymentDate,
      notes: body.notes,
      collectedById: user.id,
      orgId: user.orgId,
    });
    return json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
