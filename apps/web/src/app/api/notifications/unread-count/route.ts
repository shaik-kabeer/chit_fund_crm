import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as notificationService from '@/server/services/notification.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const count = await notificationService.getUnreadCount(user.id, user.type);
    return json({ unreadCount: count });
  } catch (e) {
    return handleRouteError(e);
  }
}
