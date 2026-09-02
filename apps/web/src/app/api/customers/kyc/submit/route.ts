import { NextRequest } from 'next/server';
import { kycSubmitSchema } from '@chitfund/shared';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireCustomer } from '@/server/auth';
import * as customerService from '@/server/services/customer.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const body = await parseBody(kycSubmitSchema, request);
    const data = await customerService.submitKyc(user.id, body);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
