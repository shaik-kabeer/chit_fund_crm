import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as notificationService from '@/server/services/notification.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') || '1');
    const limit = Number(searchParams.get('limit') || '20');

    const result = await notificationService.getForUser(user.id, user.type, page, limit);
    return json(result);
  } catch (e) {
    return handleRouteError(e);
  }
}
