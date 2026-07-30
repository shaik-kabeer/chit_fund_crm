import { NextRequest } from 'next/server';
import { json, handleRouteError, readJson } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as customerService from '@/server/services/customer.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR']);
    const { searchParams } = request.nextUrl;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const limit = searchParams.get('limit')
      ? Math.min(parseInt(searchParams.get('limit')!, 10) || 20, 100)
      : 20;
    const search = searchParams.get('search') ?? undefined;
    const data = await customerService.findAll(user.orgId, page, limit, search);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await readJson<{
      name: string;
      phone: string;
      email?: string;
      password?: string;
      branchId?: string;
    }>(request);
    const data = await customerService.createByAdmin(user.orgId, user.id, body);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
