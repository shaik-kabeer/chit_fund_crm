import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as notificationService from '@/server/services/notification.service';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    await notificationService.markAllAsRead(user.id, user.type);
    return json({ message: 'All notifications marked as read' });
  } catch (e) {
    return handleRouteError(e);
  }
}
