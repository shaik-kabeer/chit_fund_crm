import { NextRequest } from 'next/server';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as notificationService from '@/server/services/notification.service';
import { z } from 'zod';

const notifyCustomerSchema = z.object({
  customerId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR']);
    const body = await parseBody(notifyCustomerSchema, request);

    const result = await notificationService.notifyCustomerOverdue(body.customerId, user.orgId);
    return json({
      message: result.sent > 0
        ? `Overdue reminder sent to customer`
        : result.message || 'No overdue installments found',
      ...result,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
