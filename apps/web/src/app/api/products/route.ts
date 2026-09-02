import { NextRequest } from 'next/server';
import { createProductSchema } from '@chitfund/shared';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireAuth, requireStaff } from '@/server/auth';
import * as productService from '@/server/services/product.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true';
    const data = await productService.findAll(user.orgId, includeInactive);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await parseBody(createProductSchema, request);
    const data = await productService.create(user.orgId, { ...body, createdBy: user.id });
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
