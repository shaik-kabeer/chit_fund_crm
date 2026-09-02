import { NextRequest } from 'next/server';
import { createGroupSchema } from '@chitfund/shared';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireAuth, requireStaff } from '@/server/auth';
import * as groupService from '@/server/services/group.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const status = request.nextUrl.searchParams.get('status') ?? undefined;
    const branchId = request.nextUrl.searchParams.get('branchId') ?? undefined;
    const data = await groupService.findAll(user.orgId, { status, branchId });
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await parseBody(createGroupSchema, request);
    const data = await groupService.create(user.orgId, {
      ...body,
      createdBy: user.id,
    } as Parameters<typeof groupService.create>[1]);
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
