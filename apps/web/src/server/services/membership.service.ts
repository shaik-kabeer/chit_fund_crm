import { calculateDueDate } from '@chitfund/shared';
import { ApiError } from '../http';
import { prisma } from '../prisma';
import * as audit from './audit.service';
import * as notifications from './notification.service';

async function getNextTicketNumber(groupId: string): Promise<number> {
  const max = await prisma.groupMember.aggregate({
    where: { groupId, ticketNumber: { not: null } },
    _max: { ticketNumber: true },
  });
  return (max._max.ticketNumber || 0) + 1;
}

export async function requestJoin(
  customerId: string,
  groupId: string,
  orgId: string,
  opts?: { seatLabel?: string; quantity?: number },
) {
  const group = await prisma.chitGroup.findFirst({
    where: { id: groupId, orgId, status: { in: ['OPEN', 'ACTIVE'] } },
    include: { product: true },
  });
  if (!group) throw new ApiError(404, 'Group not found or not accepting enrollment');

  const quantity = Math.min(Math.max(opts?.quantity ?? 1, 1), 10);

  const pendingRequests = await prisma.groupMember.count({
    where: { groupId, status: 'REQUESTED' },
  });
  const openSlots = group.totalSeats - group.filledSeats - pendingRequests;

  if (openSlots < quantity) {
    throw new ApiError(
      400,
      openSlots <= 0
        ? 'No seats available'
        : `Only ${openSlots} seat(s) available; requested ${quantity}`,
    );
  }

  const existingSeats = await prisma.groupMember.count({
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

    const member = await prisma.groupMember.create({
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
  }

  return {
    message: quantity === 1
      ? 'Seat request submitted'
      : `${quantity} seat requests submitted`,
    seats: created,
  };
}

export async function updateSeatLabel(memberId: string, seatLabel: string, customerId?: string, orgId?: string) {
  const where: any = { id: memberId };
  if (customerId) where.customerId = customerId;
  if (orgId) where.group = { orgId };

  const member = await prisma.groupMember.findFirst({ where });
  if (!member) throw new ApiError(404, 'Seat not found');
  if (['REJECTED', 'WITHDRAWN'].includes(member.status)) {
    throw new ApiError(400, 'Cannot rename this seat');
  }

  const label = seatLabel?.trim();
  if (!label || label.length < 1 || label.length > 60) {
    throw new ApiError(400, 'Seat name must be 1–60 characters');
  }

  return prisma.groupMember.update({
    where: { id: memberId },
    data: { seatLabel: label },
  });
}

export async function adminAddSeat(
  orgId: string,
  data: { groupId: string; customerId: string; seatLabel?: string; approvedById: string },
) {
  const group = await prisma.chitGroup.findFirst({
    where: { id: data.groupId, orgId },
    include: { product: true },
  });
  if (!group) throw new ApiError(404, 'Group not found');
  if (!['OPEN', 'ACTIVE', 'DRAFT'].includes(group.status)) {
    throw new ApiError(400, 'Cannot add seats to this group status');
  }
  if (group.filledSeats >= group.totalSeats) {
    throw new ApiError(400, 'No seats available');
  }

  const customer = await prisma.customer.findFirst({
    where: { id: data.customerId, orgId, deletedAt: null },
  });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const existingSeats = await prisma.groupMember.count({
    where: {
      groupId: data.groupId,
      customerId: data.customerId,
      status: { notIn: ['REJECTED', 'WITHDRAWN'] },
    },
  });

  const label =
    data.seatLabel?.trim() ||
    (existingSeats > 0 ? `Seat ${existingSeats + 1}` : 'Self');

  const ticket = await getNextTicketNumber(data.groupId);

  return prisma.$transaction(async (tx) => {
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
    if (updated.count === 0) throw new ApiError(409, 'No seats available');

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

export async function approve(memberId: string, orgId: string, approvedById: string, ticketNumber?: number) {
  const member = await prisma.groupMember.findFirst({
    where: { id: memberId, group: { orgId } },
    include: { group: { include: { product: true } } },
  });
  if (!member) throw new ApiError(404, 'Membership not found');
  if (member.status !== 'REQUESTED') {
    throw new ApiError(400, 'Can only approve REQUESTED memberships');
  }

  const ticket = ticketNumber || await getNextTicketNumber(member.groupId);

  const result = await prisma.$transaction(async (tx) => {
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
      throw new ApiError(409, 'No seats available in this group');
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

  void audit.logAction({
    action: 'MEMBERSHIP_APPROVED',
    entityType: 'GroupMember',
    entityId: memberId,
    actorId: approvedById,
    orgId,
    changes: { ticketNumber: ticket },
  }).catch(() => {});

  void notifications.send({
    recipientType: 'customer',
    recipientId: result.customerId,
    customerId: result.customerId,
    title: 'Membership Approved',
    body: `Your request to join the chit group has been approved! You have been assigned ticket #${ticket}.`,
    data: { memberId, type: 'MEMBERSHIP_APPROVED' },
  }).catch(() => {});

  return result;
}

export async function reject(memberId: string, orgId: string, rejectedById?: string, reason?: string) {
  const member = await prisma.groupMember.findFirst({
    where: { id: memberId, group: { orgId } },
  });
  if (!member) throw new ApiError(404, 'Membership not found');
  if (member.status !== 'REQUESTED') {
    throw new ApiError(400, 'Can only reject REQUESTED memberships');
  }

  const trimmedReason = reason?.trim();

  const result = await prisma.groupMember.update({
    where: { id: memberId },
    data: {
      status: 'REJECTED',
      ...(trimmedReason ? { notes: trimmedReason } : {}),
    },
  });

  if (rejectedById) {
    void audit.logAction({
      action: 'MEMBERSHIP_REJECTED',
      entityType: 'GroupMember',
      entityId: memberId,
      actorId: rejectedById,
      orgId,
      ...(trimmedReason ? { changes: { reason: trimmedReason } } : {}),
    }).catch(() => {});
  }

  void notifications.send({
    recipientType: 'customer',
    recipientId: member.customerId,
    customerId: member.customerId,
    title: 'Membership Request Rejected',
    body: trimmedReason
      ? `Your membership request has been rejected. Reason: ${trimmedReason}`
      : 'Your membership request has been rejected. Please contact admin for details.',
    data: { memberId, type: 'MEMBERSHIP_REJECTED' },
  }).catch(() => {});

  return result;
}

export async function activateApproved(groupId: string, orgId: string, performedById?: string) {
  const group = await prisma.chitGroup.findFirst({
    where: { id: groupId, orgId },
    include: { product: true },
  });
  if (!group) throw new ApiError(404, 'Group not found');

  const approved = await prisma.groupMember.findMany({
    where: { groupId, status: 'APPROVED' },
  });

  if (approved.length === 0) {
    throw new ApiError(400, 'No approved members to activate');
  }

  const withSchedule = await prisma.installment.groupBy({
    by: ['memberId'],
    where: { memberId: { in: approved.map((m) => m.id) } },
  });
  const alreadyScheduled = new Set(withSchedule.map((r) => r.memberId));

  await prisma.$transaction(async (tx) => {
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

  if (performedById) {
    void audit.logAction({
      action: 'MEMBERS_ACTIVATED',
      entityType: 'ChitGroup',
      entityId: groupId,
      actorId: performedById,
      orgId,
      changes: { activatedCount: approved.length },
    }).catch(() => {});
  }

  return { activated: approved.length };
}

export async function getMyMemberships(customerId: string) {
  return prisma.groupMember.findMany({
    where: { customerId, status: { notIn: ['WITHDRAWN'] } },
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

export async function getMembershipDetail(memberId: string, customerId?: string) {
  const where: any = { id: memberId };
  if (customerId) where.customerId = customerId;

  const member = await prisma.groupMember.findFirst({
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
  if (!member) throw new ApiError(404, 'Membership not found');
  return member;
}

export async function markAsLifted(
  memberId: string,
  orgId: string,
  markedById: string,
  monthNumber?: number,
) {
  const member = await prisma.groupMember.findFirst({
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
  if (!member) throw new ApiError(404, 'Member not found');
  if (member.status !== 'ACTIVE') {
    throw new ApiError(400, 'Only active members can be lifted');
  }

  const product = member.group.product;
  const liftMonth = monthNumber ?? member.group.currentMonth + 1;

  if (liftMonth < 1 || liftMonth > product.tenureMonths) {
    throw new ApiError(400, `Invalid lift month ${liftMonth}`);
  }

  const alreadyLifted = await prisma.groupMember.findFirst({
    where: {
      groupId: member.groupId,
      prizedMonth: liftMonth,
      status: { in: ['PRIZED', 'COMPLETED'] },
    },
  });
  if (alreadyLifted) {
    throw new ApiError(400, `Someone already lifted in month ${liftMonth}`);
  }

  const scheduleEntry = product.payoutSchedule.find((s) => s.monthNumber === liftMonth);
  const payoutPaise = scheduleEntry?.payoutAmountPaise ?? product.payoutAmountPaise;

  await prisma.$transaction(async (tx) => {
    await tx.groupMember.update({
      where: { id: memberId },
      data: {
        status: 'PRIZED',
        prizedAt: new Date(),
        prizedMonth: liftMonth,
        currentInstallmentPaise: product.liftedInstallmentPaise,
      },
    });

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

  void audit.logAction({
    action: 'MEMBER_LIFTED',
    entityType: 'GroupMember',
    entityId: memberId,
    actorId: markedById,
    orgId,
    changes: { liftMonth, payoutAmountPaise: payoutPaise.toString() },
  }).catch(() => {});

  return {
    message: 'Member marked as lifted successfully',
    liftMonth,
    payoutAmountPaise: payoutPaise,
    newEmiPaise: product.liftedInstallmentPaise,
  };
}

export async function getPendingRequests(orgId: string) {
  return prisma.groupMember.findMany({
    where: { status: 'REQUESTED', group: { orgId } },
    include: {
      customer: { select: { id: true, name: true, phone: true, kycStatus: true } },
      group: { include: { product: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
}
