import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as productService from '@/server/services/product.service';

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const data = await productService.toggleActive(user.orgId, params.id);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
