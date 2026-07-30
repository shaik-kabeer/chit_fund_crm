import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GROUP_STATUS_TRANSITIONS, isValidTransition } from '@chitfund/shared';

/** Statuses that occupy a seat in the group. */
const OCCUPYING_STATUSES = [
  'APPROVED',
  'ACTIVE',
  'PRIZED',
  'DEFAULTING',
  'COMPLETED',
] as const;

@Injectable()
export class ChitGroupService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, data: {
    productId: string;
    groupNumber: string;
    agreementNo?: string;
    startDate: string;
    branchId?: string;
    createdBy?: string;
  }) {
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, orgId, isActive: true },
    });
    if (!product) throw new NotFoundException('Product not found or inactive');

    const existing = await this.prisma.chitGroup.findUnique({
      where: { orgId_groupNumber: { orgId, groupNumber: data.groupNumber } },
    });
    if (existing) throw new ConflictException('Group number already exists');

    return this.prisma.chitGroup.create({
      data: {
        orgId,
        branchId: data.branchId,
        productId: data.productId,
        groupNumber: data.groupNumber,
        agreementNo: data.agreementNo,
        startDate: new Date(data.startDate),
        totalSeats: product.memberCount,
        createdBy: data.createdBy,
      },
      include: { product: true },
    });
  }

  async findAll(orgId: string, filters?: { status?: string; branchId?: string }) {
    const groups = await this.prisma.chitGroup.findMany({
      where: {
        orgId,
        ...(filters?.status ? { status: filters.status as any } : {}),
        ...(filters?.branchId ? { branchId: filters.branchId } : {}),
      },
      include: {
        product: {
          select: {
            name: true, chitValuePaise: true, tenureMonths: true, memberCount: true,
            baseInstallmentPaise: true, liftedInstallmentPaise: true, payoutAmountPaise: true,
          },
        },
        members: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return groups.map(({ members, ...group }) => {
      const counts = countByStatus(members);
      return {
        ...group,
        // Derived from member rows so the list can never show a stale counter
        filledSeats: counts.occupied,
        memberCounts: counts,
      };
    });
  }

  async findById(orgId: string, id: string) {
    const group = await this.prisma.chitGroup.findFirst({
      where: { id, orgId },
      include: {
        product: {
          include: { payoutSchedule: { orderBy: { monthNumber: 'asc' } } },
        },
        members: {
          include: {
            customer: { select: { id: true, name: true, phone: true, kycStatus: true } },
            payouts: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: [{ ticketNumber: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');

    const counts = countByStatus(group.members);

    // Self-heal the cached counter if it ever drifted from reality
    if (counts.occupied !== group.filledSeats) {
      await this.prisma.chitGroup.update({
        where: { id },
        data: { filledSeats: counts.occupied },
      });
    }

    return { ...group, filledSeats: counts.occupied, memberCounts: counts };
  }

  async update(
    orgId: string,
    id: string,
    data: { groupNumber?: string; agreementNo?: string; startDate?: string; branchId?: string | null },
  ) {
    const group = await this.prisma.chitGroup.findFirst({ where: { id, orgId } });
    if (!group) throw new NotFoundException('Group not found');
    if (group.status === 'COMPLETED' || group.status === 'TERMINATED') {
      throw new BadRequestException('Completed or cancelled groups cannot be edited');
    }

    if (data.groupNumber && data.groupNumber !== group.groupNumber) {
      const duplicate = await this.prisma.chitGroup.findUnique({
        where: { orgId_groupNumber: { orgId, groupNumber: data.groupNumber.trim() } },
      });
      if (duplicate) throw new ConflictException('Group number already exists');
    }

    const updateData: Record<string, unknown> = {};
    if (data.groupNumber !== undefined) {
      updateData.groupNumber = String(data.groupNumber).trim();
    }
    if (data.agreementNo !== undefined) {
      updateData.agreementNo = data.agreementNo ? String(data.agreementNo).trim() : null;
    }
    if (data.branchId !== undefined) updateData.branchId = data.branchId || null;
    if (data.startDate !== undefined) {
      if (group.status === 'ACTIVE' && new Date(data.startDate).getTime() !== group.startDate.getTime()) {
        throw new BadRequestException('Start date cannot change after the group starts');
      }
      updateData.startDate = new Date(data.startDate);
    }

    return this.prisma.chitGroup.update({
      where: { id },
      data: { ...updateData, version: { increment: 1 } },
      include: { product: true },
    });
  }

  /**
   * Full month-by-month status for a group:
   * scheduled payout, who lifted, who paid + payment dates.
   */
  async getMonthOverview(orgId: string, groupId: string) {
    const group = await this.prisma.chitGroup.findFirst({
      where: { id: groupId, orgId },
      include: {
        product: {
          include: { payoutSchedule: { orderBy: { monthNumber: 'asc' } } },
        },
        members: {
          where: { status: { in: ['ACTIVE', 'PRIZED', 'COMPLETED', 'DEFAULTING'] } },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
          },
          orderBy: { ticketNumber: 'asc' },
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');

    const installments = await this.prisma.installment.findMany({
      where: { groupId },
      include: {
        payments: {
          where: { status: { in: ['VERIFIED', 'PENDING'] } },
          orderBy: { paymentDate: 'asc' },
        },
        member: {
          include: { customer: { select: { id: true, name: true, phone: true } } },
        },
      },
      orderBy: [{ monthNumber: 'asc' }, { member: { ticketNumber: 'asc' } }],
    });

    const tenure = group.product.tenureMonths;
    const months = [];

    for (let m = 1; m <= tenure; m++) {
      const schedule = group.product.payoutSchedule.find((s) => s.monthNumber === m);
      const liftedMember = group.members.find((mem) => mem.prizedMonth === m);
      const monthInstallments = installments.filter((i) => i.monthNumber === m);

      months.push({
        monthNumber: m,
        scheduledPayoutPaise: schedule?.payoutAmountPaise ?? group.product.payoutAmountPaise,
        isCurrent: group.currentMonth === m,
        isPast: group.currentMonth > m,
        lifted: liftedMember
          ? {
              memberId: liftedMember.id,
              customerId: liftedMember.customerId,
              ticketNumber: liftedMember.ticketNumber,
              seatLabel: liftedMember.seatLabel,
              name: liftedMember.customer.name,
              phone: liftedMember.customer.phone,
              liftedAt: liftedMember.prizedAt,
            }
          : null,
        payments: monthInstallments.map((inst) => {
          const verified = inst.payments.filter((p) => p.status === 'VERIFIED');
          const pending = inst.payments.filter((p) => p.status === 'PENDING');
          const paidDate = verified[0]?.paymentDate || verified[0]?.verifiedAt || null;
          return {
            memberId: inst.memberId,
            customerId: inst.member.customerId,
            ticketNumber: inst.member.ticketNumber,
            seatLabel: inst.member.seatLabel,
            name: inst.member.customer.name,
            phone: inst.member.customer.phone,
            installmentStatus: inst.status,
            dueAmountPaise: inst.netAmountPaise,
            paidAmountPaise: inst.paidAmountPaise,
            balancePaise: inst.balancePaise,
            dueDate: inst.dueDate,
            paidDate,
            hasPendingVerification: pending.length > 0,
            payments: inst.payments.map((p) => ({
              id: p.id,
              amountPaise: p.amountPaise,
              method: p.method,
              status: p.status,
              paymentDate: p.paymentDate,
              verifiedAt: p.verifiedAt,
              receiptNumber: p.receiptNumber,
            })),
          };
        }),
        paidCount: monthInstallments.filter((i) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID').length,
        totalMembers: monthInstallments.length || group.members.length,
      });
    }

    return {
      group: {
        id: group.id,
        groupNumber: group.groupNumber,
        status: group.status,
        currentMonth: group.currentMonth,
        startDate: group.startDate,
        productName: group.product.name,
        tenureMonths: tenure,
        baseInstallmentPaise: group.product.baseInstallmentPaise,
        liftedInstallmentPaise: group.product.liftedInstallmentPaise,
      },
      months,
    };
  }

  async updateStatus(orgId: string, id: string, newStatus: string) {
    const group = await this.prisma.chitGroup.findFirst({ where: { id, orgId } });
    if (!group) throw new NotFoundException('Group not found');

    if (!isValidTransition(GROUP_STATUS_TRANSITIONS, group.status, newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${group.status} to ${newStatus}`,
      );
    }

    // A group can start once it has paying members; a full house is not required
    // because the admin may run a short group or fill remaining seats later.
    if (newStatus === 'ACTIVE') {
      const activeMembers = await this.prisma.groupMember.count({
        where: { groupId: id, status: { in: ['APPROVED', 'ACTIVE', 'PRIZED'] } },
      });
      if (activeMembers === 0) {
        throw new BadRequestException(
          'Cannot activate: approve at least one member first',
        );
      }
    }

    return this.prisma.chitGroup.update({
      where: { id },
      data: {
        status: newStatus as any,
        ...(newStatus === 'ACTIVE' && group.currentMonth === 0
          ? { currentMonth: 1 }
          : {}),
        version: { increment: 1 },
      },
    });
  }

  async getAvailable(orgId: string) {
    const groups = await this.prisma.chitGroup.findMany({
      // Full groups are hidden so members never apply for a seat that cannot exist.
      // Counts themselves are deliberately not returned to members.
      where: { orgId, status: 'OPEN', filledSeats: { lt: this.prisma.chitGroup.fields.totalSeats } },
      select: {
        id: true,
        groupNumber: true,
        startDate: true,
        status: true,
        product: {
          select: {
            name: true, description: true, chitValuePaise: true,
            baseInstallmentPaise: true, liftedInstallmentPaise: true,
            payoutAmountPaise: true, tenureMonths: true, memberCount: true,
            payoutSchedule: { orderBy: { monthNumber: 'asc' }, select: { monthNumber: true, payoutAmountPaise: true } },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });
    return groups;
  }

  async getStats(orgId: string, id: string) {
    const group = await this.prisma.chitGroup.findFirst({
      where: { id, orgId },
      include: { product: true },
    });
    if (!group) throw new NotFoundException('Group not found');

    const [totalCollected, pendingPayments, overdueCount] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          installment: { groupId: id },
          status: 'VERIFIED',
        },
        _sum: { amountPaise: true },
      }),
      this.prisma.payment.count({
        where: {
          installment: { groupId: id },
          status: 'PENDING',
        },
      }),
      this.prisma.installment.count({
        where: { groupId: id, status: 'OVERDUE' },
      }),
    ]);

    return {
      group,
      stats: {
        totalCollected: totalCollected._sum.amountPaise || 0n,
        pendingPayments,
        overdueCount,
        completionPercent: group.product.tenureMonths > 0
          ? Math.round((group.currentMonth / group.product.tenureMonths) * 100)
          : 0,
      },
    };
  }

  async getDashboardStats(orgId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeGroups, totalCustomers, collectedThisMonth] = await Promise.all([
      this.prisma.chitGroup.count({ where: { orgId, status: 'ACTIVE' } }),
      this.prisma.customer.count({ where: { orgId } }),
      this.prisma.payment.aggregate({
        where: {
          installment: { group: { orgId } },
          status: 'VERIFIED',
          verifiedAt: { gte: startOfMonth },
        },
        _sum: { amountPaise: true },
      }),
    ]);

    return {
      activeGroups,
      totalCustomers,
      collectedThisMonth: collectedThisMonth._sum.amountPaise || 0n,
    };
  }
}

function countByStatus(members: { status: string }[]) {
  const tally = {
    requested: 0,
    approved: 0,
    active: 0,
    prized: 0,
    defaulting: 0,
    completed: 0,
    rejected: 0,
    withdrawn: 0,
    occupied: 0,
  };

  for (const m of members) {
    const key = m.status.toLowerCase() as keyof typeof tally;
    if (key in tally) tally[key] += 1;
    if ((OCCUPYING_STATUSES as readonly string[]).includes(m.status)) {
      tally.occupied += 1;
    }
  }

  return tally;
}
