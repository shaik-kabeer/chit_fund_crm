import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateDueDate } from '@chitfund/shared';

@Injectable()
export class MembershipService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async requestJoin(
    customerId: string,
    groupId: string,
    orgId: string,
    opts?: { seatLabel?: string; quantity?: number },
  ) {
    const group = await this.prisma.chitGroup.findFirst({
      where: { id: groupId, orgId, status: 'OPEN' },
      include: { product: true },
    });
    if (!group) throw new NotFoundException('Group not found or not open for enrollment');

    const quantity = Math.min(Math.max(opts?.quantity ?? 1, 1), 10);

    // Room left = total − already filled − pending requests (not yet counted in filledSeats)
    const pendingRequests = await this.prisma.groupMember.count({
      where: { groupId, status: 'REQUESTED' },
    });
    const openSlots = group.totalSeats - group.filledSeats - pendingRequests;

    if (openSlots < quantity) {
      throw new BadRequestException(
        openSlots <= 0
          ? 'No seats available'
          : `Only ${openSlots} seat(s) available; requested ${quantity}`,
      );
    }

    // Existing seats count for default labeling
    const existingSeats = await this.prisma.groupMember.count({
      where: {
        groupId,
        customerId,
        status: { notIn: ['REJECTED', 'WITHDRAWN'] },
      },
    });

    const created = [];
    for (let i = 0; i < quantity; i++) {
      const seatIndex = existingSeats + i + 1;
      const label =
        quantity === 1 && opts?.seatLabel?.trim()
          ? opts.seatLabel.trim()
          : opts?.seatLabel?.trim()
            ? `${opts.seatLabel.trim()} #${seatIndex}`
            : existingSeats + quantity > 1
              ? `Seat ${seatIndex}`
              : 'Self';

      const member = await this.prisma.groupMember.create({
        data: {
          groupId,
          customerId,
          ticketNumber: null,
          seatLabel: label,
          baseInstallmentPaise: group.product.baseInstallmentPaise,
          currentInstallmentPaise: group.product.baseInstallmentPaise,
          status: 'REQUESTED',
        },
      });
      created.push(member);
      this.events.emit('membership.requested', { member, group });
    }

    return {
      message: quantity === 1
        ? 'Seat request submitted'
        : `${quantity} seat requests submitted`,
      seats: created,
    };
  }

  async updateSeatLabel(memberId: string, seatLabel: string, customerId?: string, orgId?: string) {
    const where: any = { id: memberId };
    if (customerId) where.customerId = customerId;
    if (orgId) where.group = { orgId };

    const member = await this.prisma.groupMember.findFirst({ where });
    if (!member) throw new NotFoundException('Seat not found');
    if (['REJECTED', 'WITHDRAWN'].includes(member.status)) {
      throw new BadRequestException('Cannot rename this seat');
    }

    const label = seatLabel?.trim();
    if (!label || label.length < 1 || label.length > 60) {
      throw new BadRequestException('Seat name must be 1–60 characters');
    }

    return this.prisma.groupMember.update({
      where: { id: memberId },
      data: { seatLabel: label },
    });
  }

  /** Admin assigns an extra seat to an existing customer in a group */
  async adminAddSeat(
    orgId: string,
    data: { groupId: string; customerId: string; seatLabel?: string; approvedById: string },
  ) {
    const group = await this.prisma.chitGroup.findFirst({
      where: { id: data.groupId, orgId },
      include: { product: true },
    });
    if (!group) throw new NotFoundException('Group not found');
    if (!['OPEN', 'ACTIVE', 'DRAFT'].includes(group.status)) {
      throw new BadRequestException('Cannot add seats to this group status');
    }
    if (group.filledSeats >= group.totalSeats) {
      throw new BadRequestException('No seats available');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, orgId, deletedAt: null },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const existingSeats = await this.prisma.groupMember.count({
      where: {
        groupId: data.groupId,
        customerId: data.customerId,
        status: { notIn: ['REJECTED', 'WITHDRAWN'] },
      },
    });

    const label =
      data.seatLabel?.trim() ||
      (existingSeats > 0 ? `Seat ${existingSeats + 1}` : 'Self');

    const ticket = await this.getNextTicketNumber(data.groupId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.chitGroup.updateMany({
        where: {
          id: data.groupId,
          filledSeats: { lt: group.totalSeats },
        },
        data: {
          filledSeats: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw new ConflictException('No seats available');

      const status = group.status === 'ACTIVE' ? 'ACTIVE' : 'APPROVED';
      const member = await tx.groupMember.create({
        data: {
          groupId: data.groupId,
          customerId: data.customerId,
          ticketNumber: ticket,
          seatLabel: label,
          baseInstallmentPaise: group.product.baseInstallmentPaise,
          currentInstallmentPaise: group.product.baseInstallmentPaise,
          status: status as any,
          joinedAt: status === 'ACTIVE' ? new Date() : undefined,
          approvedById: data.approvedById,
          approvedAt: new Date(),
        },
      });

      if (status === 'ACTIVE') {
        const startDate = new Date(group.startDate);
        const installments = [];
        for (let month = 1; month <= group.product.tenureMonths; month++) {
          const dueDate = calculateDueDate(startDate, month - 1);
          installments.push({
            groupId: data.groupId,
            memberId: member.id,
            monthNumber: month,
            baseAmountPaise: group.product.baseInstallmentPaise,
            netAmountPaise: group.product.baseInstallmentPaise,
            balancePaise: group.product.baseInstallmentPaise,
            dueDate,
          });
        }
        await tx.installment.createMany({ data: installments });
      }

      return member;
    });
  }

  async approve(memberId: string, orgId: string, approvedById: string, ticketNumber?: number) {
    const member = await this.prisma.groupMember.findFirst({
      where: { id: memberId, group: { orgId } },
      include: { group: { include: { product: true } } },
    });
    if (!member) throw new NotFoundException('Membership not found');
    if (member.status !== 'REQUESTED') {
      throw new BadRequestException('Can only approve REQUESTED memberships');
    }

    // Determine ticket number
    const ticket = ticketNumber || await this.getNextTicketNumber(member.groupId);

    const result = await this.prisma.$transaction(async (tx) => {
      // Guard on capacity only — a stale `version` must not block a valid approval
      const updated = await tx.chitGroup.updateMany({
        where: {
          id: member.groupId,
          filledSeats: { lt: member.group.totalSeats },
        },
        data: {
          filledSeats: { increment: 1 },
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw new ConflictException('No seats available in this group');
      }

      const updatedMember = await tx.groupMember.update({
        where: { id: memberId },
        data: {
          status: 'APPROVED',
          ticketNumber: ticket,
          approvedById,
          approvedAt: new Date(),
        },
        include: { customer: { select: { id: true, name: true, phone: true } } },
      });

      // If the group is already running, activate immediately and build the schedule
      if (member.group.status === 'ACTIVE') {
        await tx.groupMember.update({
          where: { id: memberId },
          data: { status: 'ACTIVE', joinedAt: new Date() },
        });

        const startDate = new Date(member.group.startDate);
        const installments = [];
        for (let month = 1; month <= member.group.product.tenureMonths; month++) {
          installments.push({
            groupId: member.groupId,
            memberId,
            monthNumber: month,
            baseAmountPaise: member.baseInstallmentPaise,
            netAmountPaise: member.baseInstallmentPaise,
            balancePaise: member.baseInstallmentPaise,
            dueDate: calculateDueDate(startDate, month - 1),
          });
        }
        await tx.installment.createMany({ data: installments });
        return { ...updatedMember, status: 'ACTIVE' as const, joinedAt: new Date() };
      }

      return updatedMember;
    });

    this.events.emit('membership.approved', { member: result });
    return result;
  }

  async reject(memberId: string, orgId: string) {
    const member = await this.prisma.groupMember.findFirst({
      where: { id: memberId, group: { orgId } },
    });
    if (!member) throw new NotFoundException('Membership not found');
    if (member.status !== 'REQUESTED') {
      throw new BadRequestException('Can only reject REQUESTED memberships');
    }

    const updated = await this.prisma.groupMember.update({
      where: { id: memberId },
      data: { status: 'REJECTED' },
    });

    this.events.emit('membership.rejected', { member: updated });
    return updated;
  }

  async activateApproved(groupId: string, orgId: string) {
    const group = await this.prisma.chitGroup.findFirst({
      where: { id: groupId, orgId },
      include: { product: true },
    });
    if (!group) throw new NotFoundException('Group not found');

    const approved = await this.prisma.groupMember.findMany({
      where: { groupId, status: 'APPROVED' },
    });

    if (approved.length === 0) {
      throw new BadRequestException('No approved members to activate');
    }

    // Members already holding a schedule must not get a duplicate one
    const withSchedule = await this.prisma.installment.groupBy({
      by: ['memberId'],
      where: { memberId: { in: approved.map((m) => m.id) } },
    });
    const alreadyScheduled = new Set(withSchedule.map((r) => r.memberId));

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.updateMany({
        where: { groupId, status: 'APPROVED' },
        data: { status: 'ACTIVE', joinedAt: new Date() },
      });

      const startDate = new Date(group.startDate);
      const installments = [];

      for (const member of approved) {
        if (alreadyScheduled.has(member.id)) continue;
        for (let month = 1; month <= group.product.tenureMonths; month++) {
          installments.push({
            groupId,
            memberId: member.id,
            monthNumber: month,
            baseAmountPaise: member.baseInstallmentPaise,
            netAmountPaise: member.baseInstallmentPaise,
            balancePaise: member.baseInstallmentPaise,
            dueDate: calculateDueDate(startDate, month - 1),
          });
        }
      }

      if (installments.length > 0) {
        await tx.installment.createMany({ data: installments });
      }

      // Activating members starts the cycle so the monthly view has a current month
      if (group.status === 'OPEN' || group.status === 'DRAFT') {
        await tx.chitGroup.update({
          where: { id: groupId },
          data: {
            status: 'ACTIVE',
            currentMonth: group.currentMonth > 0 ? group.currentMonth : 1,
            version: { increment: 1 },
          },
        });
      }
    });

    return { activated: approved.length };
  }

  async getMyMemberships(customerId: string) {
    return this.prisma.groupMember.findMany({
      where: { customerId, status: { notIn: ['REJECTED', 'WITHDRAWN'] } },
      include: {
        group: {
          include: {
            product: {
              select: {
                name: true, chitValuePaise: true, tenureMonths: true,
                baseInstallmentPaise: true, liftedInstallmentPaise: true, payoutAmountPaise: true,
                payoutSchedule: { orderBy: { monthNumber: 'asc' }, select: { monthNumber: true, payoutAmountPaise: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMembershipDetail(memberId: string, customerId?: string) {
    const where: any = { id: memberId };
    if (customerId) where.customerId = customerId;

    const member = await this.prisma.groupMember.findFirst({
      where,
      include: {
        group: { include: { product: { include: { payoutSchedule: { orderBy: { monthNumber: 'asc' } } } } } },
        installments: {
          orderBy: { monthNumber: 'asc' },
          include: { payments: { orderBy: { createdAt: 'desc' } } },
        },
        customer: { select: { id: true, name: true, phone: true } },
        payouts: true,
      },
    });
    if (!member) throw new NotFoundException('Membership not found');
    return member;
  }

  /**
   * Admin marks a member as "lifted" for a given month.
   * Payout amount comes from the product's monthly schedule for that month.
   * Future unpaid installments switch to the lifted EMI.
   */
  async markAsLifted(
    memberId: string,
    orgId: string,
    markedById: string,
    monthNumber?: number,
  ) {
    const member = await this.prisma.groupMember.findFirst({
      where: { id: memberId, group: { orgId } },
      include: {
        group: {
          include: {
            product: {
              include: { payoutSchedule: { orderBy: { monthNumber: 'asc' } } },
            },
          },
        },
      },
    });
    if (!member) throw new NotFoundException('Member not found');
    if (member.status !== 'ACTIVE') {
      throw new BadRequestException('Only active members can be lifted');
    }

    const product = member.group.product;
    const liftMonth = monthNumber ?? member.group.currentMonth + 1;

    if (liftMonth < 1 || liftMonth > product.tenureMonths) {
      throw new BadRequestException(`Invalid lift month ${liftMonth}`);
    }

    // Ensure no one else already lifted this month in this group
    const alreadyLifted = await this.prisma.groupMember.findFirst({
      where: {
        groupId: member.groupId,
        prizedMonth: liftMonth,
        status: { in: ['PRIZED', 'COMPLETED'] },
      },
    });
    if (alreadyLifted) {
      throw new BadRequestException(`Someone already lifted in month ${liftMonth}`);
    }

    const scheduleEntry = product.payoutSchedule.find((s) => s.monthNumber === liftMonth);
    const payoutPaise = scheduleEntry?.payoutAmountPaise ?? product.payoutAmountPaise;

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.update({
        where: { id: memberId },
        data: {
          status: 'PRIZED',
          prizedAt: new Date(),
          prizedMonth: liftMonth,
          currentInstallmentPaise: product.liftedInstallmentPaise,
        },
      });

      // Adjust future unpaid installments (from lift month onward) to lifted EMI
      await tx.installment.updateMany({
        where: {
          memberId,
          monthNumber: { gte: liftMonth },
          status: { in: ['UPCOMING', 'DUE', 'OVERDUE'] },
        },
        data: {
          baseAmountPaise: product.liftedInstallmentPaise,
          netAmountPaise: product.liftedInstallmentPaise,
          balancePaise: product.liftedInstallmentPaise,
        },
      });

      await tx.payout.create({
        data: {
          memberId,
          prizeAmountPaise: payoutPaise,
          netPayoutPaise: payoutPaise,
          status: 'PENDING',
          notes: `Month ${liftMonth} lift payout`,
        },
      });

      // Advance currentMonth if lifting the next sequential month
      if (liftMonth === member.group.currentMonth + 1) {
        await tx.chitGroup.update({
          where: { id: member.groupId },
          data: { currentMonth: liftMonth },
        });
      }

      await tx.ledgerEntry.create({
        data: {
          groupId: member.groupId,
          entryDate: new Date(),
          narration: `Payout to ticket #${member.ticketNumber} (Month ${liftMonth})`,
          entryType: 'DEBIT',
          amountPaise: payoutPaise,
          accountHead: 'PAYOUT',
          refType: 'payout',
          memberId,
          createdBy: markedById,
        },
      });
    });

    return {
      message: 'Member marked as lifted successfully',
      liftMonth,
      payoutAmountPaise: payoutPaise,
      newEmiPaise: product.liftedInstallmentPaise,
    };
  }

  async getPendingRequests(orgId: string) {
    return this.prisma.groupMember.findMany({
      where: { status: 'REQUESTED', group: { orgId } },
      include: {
        customer: { select: { id: true, name: true, phone: true, kycStatus: true } },
        group: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async getNextTicketNumber(groupId: string): Promise<number> {
    const max = await this.prisma.groupMember.aggregate({
      where: { groupId, ticketNumber: { not: null } },
      _max: { ticketNumber: true },
    });
    return (max._max.ticketNumber || 0) + 1;
  }
}
