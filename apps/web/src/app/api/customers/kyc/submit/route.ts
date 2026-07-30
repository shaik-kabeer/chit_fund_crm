import { NextRequest } from 'next/server';
import { json, handleRouteError, readJson } from '@/server/http';
import { requireCustomer } from '@/server/auth';
import * as customerService from '@/server/services/customer.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const body = await readJson(request);
    const data = await customerService.submitKyc(user.id, body);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
