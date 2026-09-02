import { NextRequest } from 'next/server';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as notificationService from '@/server/services/notification.service';
import { z } from 'zod';

const remindUnpaidSchema = z.object({
  groupId: z.string().uuid(),
  monthNumber: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR']);
    const body = await parseBody(remindUnpaidSchema, request);

    const result = await notificationService.remindUnpaidMembers(
      body.groupId,
      body.monthNumber,
      user.orgId,
    );

    return json({ message: `Reminders sent to ${result.sent} member(s)`, ...result });
  } catch (e) {
    return handleRouteError(e);
  }
}
