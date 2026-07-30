import { NextRequest } from 'next/server';
import { requireStaff } from '@/server/auth';
import { handleRouteError, json, readJson } from '@/server/http';
import { resetPassword } from '@/server/services/customer.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await readJson<{ password?: string }>(request);
    return json(await resetPassword(user.orgId, params.id, body.password));
  } catch (error) {
    return handleRouteError(error);
  }
}
