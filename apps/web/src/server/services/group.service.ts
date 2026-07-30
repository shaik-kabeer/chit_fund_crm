import { GROUP_STATUS_TRANSITIONS, isValidTransition } from '@chitfund/shared';
import { ApiError } from '../http';
import { prisma } from '../prisma';

/** Statuses that occupy a seat in the group. */
const OCCUPYING_STATUSES = [
  'APPROVED',
  'ACTIVE',
  'PRIZED',
  'DEFAULTING',
  'COMPLETED',
] as const;

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

export async function create(orgId: string, data: {
  productId: string;
  groupNumber: string;
  agreementNo?: string;
  startDate: string;
  branchId?: string;
  createdBy?: string;
}) {
  const product = await prisma.product.findFirst({
    where: { id: data.productId, orgId, isActive: true },
  });
  if (!product) throw new ApiError(404, 'Product not found or inactive');

  const existing = await prisma.chitGroup.findUnique({
    where: { orgId_groupNumber: { orgId, groupNumber: data.groupNumber } },
  });
  if (existing) throw new ApiError(409, 'Group number already exists');

  return prisma.chitGroup.create({
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

export async function findAll(orgId: string, filters?: { status?: string; branchId?: string }) {
  const groups = await prisma.chitGroup.findMany({
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
      filledSeats: counts.occupied,
      memberCounts: counts,
    };
  });
}

export async function findById(orgId: string, id: string) {
  const group = await prisma.chitGroup.findFirst({
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
  if (!group) throw new ApiError(404, 'Group not found');

  const counts = countByStatus(group.members);

  if (counts.occupied !== group.filledSeats) {
    await prisma.chitGroup.update({
      where: { id },
      data: { filledSeats: counts.occupied },
    });
  }

  return { ...group, filledSeats: counts.occupied, memberCounts: counts };
}

export async function update(
  orgId: string,
  id: string,
  data: { groupNumber?: string; agreementNo?: string; startDate?: string; branchId?: string | null },
) {
  const group = await prisma.chitGroup.findFirst({ where: { id, orgId } });
  if (!group) throw new ApiError(404, 'Group not found');
  if (group.status === 'COMPLETED' || group.status === 'TERMINATED') {
    throw new ApiError(400, 'Completed or cancelled groups cannot be edited');
  }

  if (data.groupNumber && data.groupNumber !== group.groupNumber) {
    const duplicate = await prisma.chitGroup.findUnique({
      where: { orgId_groupNumber: { orgId, groupNumber: data.groupNumber.trim() } },
    });
    if (duplicate) throw new ApiError(409, 'Group number already exists');
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
      throw new ApiError(400, 'Start date cannot change after the group starts');
    }
    updateData.startDate = new Date(data.startDate);
  }

  return prisma.chitGroup.update({
    where: { id },
    data: { ...updateData, version: { increment: 1 } },
    include: { product: true },
  });
}

export async function getMonthOverview(orgId: string, groupId: string) {
  const group = await prisma.chitGroup.findFirst({
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
  if (!group) throw new ApiError(404, 'Group not found');

  const installments = await prisma.installment.findMany({
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

export async function updateStatus(orgId: string, id: string, newStatus: string) {
  const group = await prisma.chitGroup.findFirst({ where: { id, orgId } });
  if (!group) throw new ApiError(404, 'Group not found');

  if (!isValidTransition(GROUP_STATUS_TRANSITIONS, group.status, newStatus)) {
    throw new ApiError(
      400,
      `Cannot transition from ${group.status} to ${newStatus}`,
    );
  }

  if (newStatus === 'ACTIVE') {
    const activeMembers = await prisma.groupMember.count({
      where: { groupId: id, status: { in: ['APPROVED', 'ACTIVE', 'PRIZED'] } },
    });
    if (activeMembers === 0) {
      throw new ApiError(
        400,
        'Cannot activate: approve at least one member first',
      );
    }
  }

  return prisma.chitGroup.update({
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

export async function getAvailable(orgId: string) {
  const groups = await prisma.chitGroup.findMany({
    where: {
      orgId,
      status: { in: ['OPEN', 'ACTIVE'] },
      filledSeats: { lt: prisma.chitGroup.fields.totalSeats },
    },
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

export async function getStats(orgId: string, id: string) {
  const group = await prisma.chitGroup.findFirst({
    where: { id, orgId },
    include: { product: true },
  });
  if (!group) throw new ApiError(404, 'Group not found');

  const [totalCollected, pendingPayments, overdueCount] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        installment: { groupId: id },
        status: 'VERIFIED',
      },
      _sum: { amountPaise: true },
    }),
    prisma.payment.count({
      where: {
        installment: { groupId: id },
        status: 'PENDING',
      },
    }),
    prisma.installment.count({
      where: { groupId: id, status: 'OVERDUE' },
    }),
  ]);

  return {
    group,
    stats: {
      totalCollected: totalCollected._sum.amountPaise || BigInt(0),
      pendingPayments,
      overdueCount,
      completionPercent: group.product.tenureMonths > 0
        ? Math.round((group.currentMonth / group.product.tenureMonths) * 100)
        : 0,
    },
  };
}

export async function getDashboardStats(orgId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [activeGroups, totalCustomers, collectedThisMonth] = await Promise.all([
    prisma.chitGroup.count({ where: { orgId, status: 'ACTIVE' } }),
    prisma.customer.count({ where: { orgId } }),
    prisma.payment.aggregate({
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
    collectedThisMonth: collectedThisMonth._sum.amountPaise || BigInt(0),
  };
}
