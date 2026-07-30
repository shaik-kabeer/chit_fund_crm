import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as paymentService from '@/server/services/payment.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const customerId = user.type === 'customer' ? user.id : undefined;
    if (!customerId) {
      return json({
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNext: false, hasPrev: false },
      });
    }
    const { searchParams } = request.nextUrl;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const limit = searchParams.get('limit')
      ? Math.min(parseInt(searchParams.get('limit')!, 10) || 20, 100)
      : 20;
    const data = await paymentService.getPaymentHistory(customerId, page, limit);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
