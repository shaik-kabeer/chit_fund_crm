import { NextRequest } from 'next/server';
import { json, ApiError, handleRouteError } from '@/server/http';
import * as notificationService from '@/server/services/notification.service';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      throw new ApiError(401, 'Unauthorized');
    }

    const result = await notificationService.sendAutomatedPaymentReminders();

    return json({
      message: 'Payment reminder cron complete',
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
