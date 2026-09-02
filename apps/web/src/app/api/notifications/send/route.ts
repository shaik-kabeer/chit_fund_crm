import { NextRequest } from 'next/server';
import { json, handleRouteError, parseBody } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as notificationService from '@/server/services/notification.service';
import { z } from 'zod';

const sendNotificationSchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  channel: z.enum(['IN_APP', 'SMS', 'WHATSAPP', 'EMAIL', 'PUSH']).default('IN_APP'),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR']);
    const body = await parseBody(sendNotificationSchema, request);

    const result = await notificationService.sendManual({
      customerId: body.customerId,
      title: body.title,
      body: body.body,
      channel: body.channel,
      orgId: user.orgId,
    });

    return json({ message: 'Notification sent', id: result.id });
  } catch (e) {
    return handleRouteError(e);
  }
}
