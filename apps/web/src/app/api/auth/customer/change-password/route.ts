import { NextRequest } from 'next/server';
import { requireCustomer } from '@/server/auth';
import { changePasswordSchema } from '@chitfund/shared';
import { handleRouteError, json, parseBody } from '@/server/http';
import { changeCustomerPassword } from '@/server/services/auth.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const body = await parseBody(changePasswordSchema, request);
    const result = await changeCustomerPassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
