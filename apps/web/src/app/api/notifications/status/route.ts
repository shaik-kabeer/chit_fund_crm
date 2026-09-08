import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireAuth } from '@/server/auth';
import * as notificationService from '@/server/services/notification.service';

export async function GET(_request: NextRequest) {
  try {
    return json({
      whatsappEnabled: notificationService.isWhatsAppEnabled(),
      channels: ['IN_APP', 'WHATSAPP'],
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
