import { NextRequest } from 'next/server';
import { json, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import * as auditService from '@/server/services/audit.service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN']);
    const { searchParams } = request.nextUrl;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const limit = searchParams.get('limit')
      ? Math.min(parseInt(searchParams.get('limit')!, 10) || 20, 100)
      : 20;
    const entityType = searchParams.get('entityType') || undefined;
    const action = searchParams.get('action') || undefined;

    const data = await auditService.getAuditLogs(user.orgId, page, limit, {
      entityType,
      action,
    });
    return json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}
