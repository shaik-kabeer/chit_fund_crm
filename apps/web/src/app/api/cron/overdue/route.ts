import { NextRequest } from 'next/server';
import { json, ApiError, handleRouteError } from '@/server/http';
import { prisma } from '@/server/prisma';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      throw new ApiError(401, 'Unauthorized');
    }

    const now = new Date();

    const overdueResult = await prisma.installment.updateMany({
      where: {
        status: 'DUE',
        dueDate: { lt: now },
      },
      data: { status: 'OVERDUE' },
    });

    const defaultingMembers = await prisma.installment.groupBy({
      by: ['memberId'],
      where: { status: 'OVERDUE' },
      _count: { _all: true },
      having: {
        memberId: {
          _count: {
            gte: 3,
          },
        },
      },
    });

    let defaultingUpdated = 0;
    if (defaultingMembers.length > 0) {
      const memberIds = defaultingMembers.map((m) => m.memberId);
      const result = await prisma.groupMember.updateMany({
        where: {
          id: { in: memberIds },
          status: 'ACTIVE',
        },
        data: { status: 'DEFAULTING' },
      });
      defaultingUpdated = result.count;
    }

    return json({
      message: 'Overdue check complete',
      overdueMarked: overdueResult.count,
      defaultingMarked: defaultingUpdated,
      timestamp: now.toISOString(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
