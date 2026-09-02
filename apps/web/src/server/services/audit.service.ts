import { prisma } from '../prisma';

export async function logAction(params: {
  action: string;
  entityType: string;
  entityId?: string;
  actorId: string;
  actorType?: 'staff' | 'customer';
  orgId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}) {
  return prisma.auditLog.create({
    data: {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      actorId: params.actorId,
      actorType: params.actorType ?? 'staff',
      orgId: params.orgId,
      changes: params.changes ? JSON.parse(JSON.stringify(params.changes)) : undefined,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

export async function getAuditLogs(
  orgId: string,
  page = 1,
  limit = 20,
  filters?: { entityType?: string; action?: string },
) {
  const skip = (page - 1) * limit;
  const where: { orgId: string; entityType?: string; action?: string } = { orgId };
  if (filters?.entityType) where.entityType = filters.entityType;
  if (filters?.action) where.action = filters.action;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const staffIds = [...new Set(logs.filter((l) => l.actorType === 'staff').map((l) => l.actorId))];
  const staffList = staffIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true, role: true },
      })
    : [];
  const staffMap = new Map(staffList.map((s) => [s.id, s]));

  const data = logs.map((log) => ({
    ...log,
    performedBy: log.actorType === 'staff' ? staffMap.get(log.actorId) ?? null : null,
  }));

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}
