import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as notificationService from '@/server/services/notification.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);
    const result = await notificationService.notifyAllOverdue(user.orgId);
    return json({
      message: `Overdue reminders sent to ${result.sent} customer(s)`,
      ...result,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
