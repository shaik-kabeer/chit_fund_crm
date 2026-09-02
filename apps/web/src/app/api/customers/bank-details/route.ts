import { NextRequest } from 'next/server';
import { updateBankDetailsSchema } from '@chitfund/shared';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireCustomer } from '@/server/auth';
import * as customerService from '@/server/services/customer.service';

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const body = await parseBody(updateBankDetailsSchema, request);
    const data = await customerService.updateBankDetails(user.id, body);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
