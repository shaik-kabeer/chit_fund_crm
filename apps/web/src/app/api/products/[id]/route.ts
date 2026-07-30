import { NextRequest } from 'next/server';
import { json, handleRouteError, readJson } from '@/server/http';
import { requireAuth, requireStaff } from '@/server/auth';
import * as productService from '@/server/services/product.service';

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth(request);
    const data = await productService.findById(user.orgId, params.id);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await readJson(request);
    const data = await productService.update(user.orgId, params.id, body);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
