import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(data: {
    orgId: string;
    actorType: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId?: string;
    changes?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({ data });
  }

  async findAll(orgId: string, filters?: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { orgId };
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.actorId) where.actorId = filters.actorId;
    if (filters?.action) where.action = filters.action;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // Event listeners that actually consume the events
  @OnEvent('membership.approved')
  async onMemberApproved(payload: any) {
    const member = payload.member;
    if (member?.group?.orgId) {
      await this.log({
        orgId: member.group.orgId,
        actorType: 'staff',
        actorId: member.approvedById || 'system',
        action: 'APPROVE',
        entityType: 'group_member',
        entityId: member.id,
        changes: { status: { old: 'REQUESTED', new: 'APPROVED' } },
      });
    }
  }

  @OnEvent('payment.verified')
  async onPaymentVerified(payload: any) {
    // Audit log for payment verification is handled inline in PaymentService
  }

  @OnEvent('auction.completed')
  async onAuctionCompleted(payload: any) {
    // Auction audit log handled inline in AuctionService transaction
  }
}
