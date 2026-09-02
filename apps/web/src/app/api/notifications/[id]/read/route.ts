import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as notificationService from '@/server/services/notification.service';

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireAuth(request);
    const result = await notificationService.markAsRead(params.id, user.id);
    return json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
