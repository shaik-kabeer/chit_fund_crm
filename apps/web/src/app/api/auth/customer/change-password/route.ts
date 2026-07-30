import { NextRequest } from 'next/server';
import { requireCustomer } from '@/server/auth';
import { handleRouteError, json, readJson } from '@/server/http';
import { changeCustomerPassword } from '@/server/services/auth.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireCustomer(request);
    const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
    const result = await changeCustomerPassword(
      user.id,
      body.currentPassword || '',
      body.newPassword || '',
    );
    return json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
