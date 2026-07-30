import { Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InstallmentService {
  constructor(private prisma: PrismaService) {}

  async getForMember(memberId: string, customerId?: string) {
    const where: any = { memberId };
    if (customerId) {
      const member = await this.prisma.groupMember.findFirst({ where: { id: memberId, customerId } });
      if (!member) throw new NotFoundException('Membership not found');
    }
    return this.prisma.installment.findMany({
      where,
      include: { payments: { orderBy: { createdAt: 'desc' } } },
      orderBy: { monthNumber: 'asc' },
    });
  }

  async getGroupInstallments(groupId: string, monthNumber?: number) {
    return this.prisma.installment.findMany({
      where: { groupId, ...(monthNumber ? { monthNumber } : {}) },
      include: {
        member: { include: { customer: { select: { name: true, phone: true } } } },
        payments: { where: { status: { in: ['PENDING', 'VERIFIED'] } } },
      },
      orderBy: [{ monthNumber: 'asc' }, { member: { ticketNumber: 'asc' } }],
    });
  }

  async getOverdueSummary(orgId: string) {
    return this.prisma.installment.findMany({
      where: {
        status: 'OVERDUE',
        group: { orgId },
      },
      include: {
        member: { include: { customer: { select: { name: true, phone: true } } } },
        group: { select: { groupNumber: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async markOverdue() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.installment.updateMany({
      where: {
        status: { in: ['DUE', 'UPCOMING'] },
        dueDate: { lt: today },
        balancePaise: { gt: 0 },
      },
      data: { status: 'OVERDUE' },
    });

    // Mark DUE for upcoming installments that are now current
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    await this.prisma.installment.updateMany({
      where: {
        status: 'UPCOMING',
        dueDate: { lte: nextWeek, gte: today },
      },
      data: { status: 'DUE' },
    });
  }
}
