import { NextRequest } from 'next/server';
import { updateCustomerSchema } from '@chitfund/shared';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as customerService from '@/server/services/customer.service';

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR']);
    const data = await customerService.findById(user.orgId, params.id);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await parseBody(updateCustomerSchema, request);
    const data = await customerService.updateByAdmin(user.orgId, params.id, body);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
