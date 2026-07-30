import { NextRequest } from 'next/server';
import { json, handleRouteError, readJson } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as customerService from '@/server/services/customer.service';

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await readJson<{ status: string; reason?: string }>(request);
    const data = await customerService.updateKycStatus(
      user.orgId,
      params.id,
      body.status,
      user.id,
      body.reason,
    );
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
