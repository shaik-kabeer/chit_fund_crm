import { NextRequest } from 'next/server';
import { requireStaff } from '@/server/auth';
import { adminResetPasswordSchema } from '@chitfund/shared';
import { handleRouteError, json, parseBody } from '@/server/http';
import { resetPassword } from '@/server/services/customer.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const body = await parseBody(adminResetPasswordSchema, request);
    return json(await resetPassword(user.orgId, params.id, body.password));
  } catch (error) {
    return handleRouteError(error);
  }
}
