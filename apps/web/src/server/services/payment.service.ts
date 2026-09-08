import { ApiError } from '../http';
import { prisma } from '../prisma';
import { getMonthLabel } from '@chitfund/shared';
import * as audit from './audit.service';
import * as notifications from './notification.service';

/** Online methods require payment screenshot proof */
const ONLINE_METHODS = new Set(['UPI', 'NEFT', 'ONLINE_GATEWAY', 'CHEQUE']);
const ALLOWED_METHODS = new Set(['CASH', 'UPI', 'NEFT', 'CHEQUE', 'ONLINE_GATEWAY']);

async function generateReceiptNumber(groupId: string): Promise<string> {
  const group = await prisma.chitGroup.findUnique({
    where: { id: groupId },
    select: { orgId: true },
  });

  const sequence = await prisma.receiptSequence.upsert({
    where: { orgId_prefix: { orgId: group!.orgId, prefix: 'RCP' } },
    create: { orgId: group!.orgId, prefix: 'RCP', currentNumber: 1 },
    update: { currentNumber: { increment: 1 } },
  });

  return `RCP-${String(sequence.currentNumber).padStart(8, '0')}`;
}

export async function getOrgPaymentInfo(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      name: true,
      paymentUpiId: true,
      paymentPhone: true,
      paymentQrUrl: true,
      phone: true,
    },
  });
  if (!org) throw new ApiError(404, 'Organization not found');
  return org;
}

export async function submitPayment(data: {
  installmentId: string;
  amountPaise: number;
  method: string;
  transactionRef?: string;
  paymentDate: string;
  screenshotUrl?: string;
  customerId?: string;
  collectedById?: string;
}) {
  const method = (data.method || '').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new ApiError(400, `Invalid payment method. Use: ${[...ALLOWED_METHODS].join(', ')}`);
  }

  if (ONLINE_METHODS.has(method) && !data.screenshotUrl) {
    throw new ApiError(
      400,
      'Screenshot of payment is required for online / UPI payments',
    );
  }
  if (method === 'UPI' && !data.transactionRef?.trim()) {
    throw new ApiError(400, 'UPI transaction / reference ID is required');
  }

  const installment = await prisma.installment.findUnique({
    where: { id: data.installmentId },
    include: { member: true },
  });
  if (!installment) throw new ApiError(404, 'Installment not found');

  if (data.customerId && installment.member.customerId !== data.customerId) {
    throw new ApiError(400, 'Not your installment');
  }

  if (installment.status === 'PAID' || installment.status === 'WAIVED') {
    throw new ApiError(400, 'Installment already settled');
  }

  const pendingExisting = await prisma.payment.findFirst({
    where: { installmentId: data.installmentId, status: 'PENDING' },
  });
  if (pendingExisting) {
    throw new ApiError(
      409,
      'A payment request is already pending verification for this month',
    );
  }

  if (BigInt(data.amountPaise) > installment.balancePaise) {
    throw new ApiError(
      400,
      `Amount exceeds balance. Outstanding: ₹${Number(installment.balancePaise) / 100}`,
    );
  }
  if (data.amountPaise <= 0) {
    throw new ApiError(400, 'Amount must be positive');
  }

  if (data.transactionRef) {
    const existingTxn = await prisma.payment.findFirst({
      where: { transactionRef: data.transactionRef, status: { not: 'REJECTED' } },
    });
    if (existingTxn) {
      throw new ApiError(409, 'Transaction reference already used');
    }
  }

  const receiptNumber = await generateReceiptNumber(installment.member.groupId);

  const payment = await prisma.payment.create({
    data: {
      installmentId: data.installmentId,
      receiptNumber,
      amountPaise: BigInt(data.amountPaise),
      method: method as any,
      transactionRef: data.transactionRef?.trim() || null,
      screenshotUrl: data.screenshotUrl || null,
      paymentDate: new Date(data.paymentDate || new Date()),
      collectedById: data.collectedById,
      status: 'PENDING',
    },
  });

  return {
    ...payment,
    message: 'Payment request submitted. Awaiting collector/admin verification.',
  };
}

export async function verifyPayment(paymentId: string, verifiedById: string, orgId: string) {
  const paymentWithRelations = await prisma.payment.findFirst({
    where: { id: paymentId, installment: { group: { orgId } } },
    include: {
      installment: {
        include: {
          member: {
            include: {
              customer: { select: { id: true, name: true, phone: true } },
              group: {
                select: {
                  groupNumber: true,
                  startDate: true,
                  currentMonth: true,
                  totalSeats: true,
                  product: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!paymentWithRelations) throw new ApiError(404, 'Payment not found');
  if (paymentWithRelations.status !== 'PENDING') {
    throw new ApiError(400, 'Payment is not in pending state');
  }

  const { installment } = paymentWithRelations;
  const { member } = installment;
  const { customer, group } = member;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'VERIFIED', verifiedById, verifiedAt: new Date() },
    });

    const newPaid = installment.paidAmountPaise + paymentWithRelations.amountPaise;
    const newBalance = installment.netAmountPaise - newPaid;
    const fullyPaid = newBalance <= BigInt(0);

    await tx.installment.update({
      where: { id: paymentWithRelations.installmentId },
      data: {
        paidAmountPaise: newPaid,
        balancePaise: newBalance < BigInt(0) ? BigInt(0) : newBalance,
        status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
        paidDate: fullyPaid ? new Date() : undefined,
      },
    });

    await tx.groupMember.update({
      where: { id: installment.memberId },
      data: { totalPaidPaise: { increment: paymentWithRelations.amountPaise } },
    });

    await tx.chitGroup.update({
      where: { id: installment.groupId },
      data: { totalCollectedPaise: { increment: paymentWithRelations.amountPaise } },
    });

    await tx.ledgerEntry.create({
      data: {
        groupId: installment.groupId,
        entryDate: new Date(),
        narration: `Payment received - Receipt #${paymentWithRelations.receiptNumber} (${paymentWithRelations.method})`,
        entryType: 'CREDIT',
        amountPaise: paymentWithRelations.amountPaise,
        accountHead: 'COLLECTION',
        refType: 'payment',
        refId: paymentId,
        memberId: installment.memberId,
        createdBy: verifiedById,
      },
    });
  });

  void audit.logAction({
    action: 'PAYMENT_VERIFIED',
    entityType: 'Payment',
    entityId: paymentId,
    actorId: verifiedById,
    orgId,
    changes: { receiptNumber: paymentWithRelations.receiptNumber, amountPaise: paymentWithRelations.amountPaise.toString() },
  }).catch(() => {});

  void notifications.notifyPaymentReceived({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    amountPaise: Number(paymentWithRelations.amountPaise),
    groupName: group.product.name,
    groupNumber: group.groupNumber,
    monthLabel: getMonthLabel(group.startDate, installment.monthNumber),
    monthNumber: installment.monthNumber,
    receiptNumber: paymentWithRelations.receiptNumber,
    paymentDate: paymentWithRelations.paymentDate,
    currentMonth: group.currentMonth,
    totalSeats: group.totalSeats,
    remainingBalancePaise: Math.max(Number(installment.netAmountPaise - (installment.paidAmountPaise + paymentWithRelations.amountPaise)), 0),
    startDate: group.startDate,
  }).catch(() => {});

  return { message: 'Payment verified and marked as received' };
}
export async function rejectPayment(paymentId: string, reason: string, rejectedById: string, orgId: string) {
  if (!reason || reason.trim().length < 5) {
    throw new ApiError(400, 'Write a clear rejection review (minimum 5 characters)');
  }
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, installment: { group: { orgId } } },
    include: { installment: { include: { member: true } } },
  });
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== 'PENDING') {
    throw new ApiError(400, 'Payment is not in pending state');
  }

  await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'REJECTED',
      rejectedAt: new Date(),
      rejectionReason: reason.trim(),
    },
  });

  void audit.logAction({
    action: 'PAYMENT_REJECTED',
    entityType: 'Payment',
    entityId: paymentId,
    actorId: rejectedById,
    orgId,
    changes: { reason: reason.trim() },
  }).catch(() => {});

  void notifications.send({
    recipientType: 'customer',
    recipientId: payment.installment.member.customerId,
    customerId: payment.installment.member.customerId,
    title: 'Payment Rejected',
    body: `Your payment for Month ${payment.installment.monthNumber} was rejected. Reason: ${reason.trim()}. Please resubmit with correct details.`,
    data: { paymentId, type: 'PAYMENT_REJECTED' },
  }).catch(() => {});

  return { message: 'Payment request rejected' };
}
export async function getPendingPayments(orgId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where: { status: 'PENDING', installment: { group: { orgId } } },
      include: {
        installment: {
          include: {
            member: {
              include: {
                customer: { select: { id: true, name: true, phone: true } },
                group: {
                  select: {
                    id: true,
                    groupNumber: true,
                    product: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.payment.count({
      where: { status: 'PENDING', installment: { group: { orgId } } },
    }),
  ]);

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

/**
 * Admin/staff "Mark as Paid" — records an offline payment and immediately marks it VERIFIED.
 * Useful for cash collections or when customer has no account.
 */
export async function markAsPaid(data: {
  installmentId: string;
  amountPaise: number;
  method?: string;
  paymentDate?: string;
  notes?: string;
  collectedById: string;
  orgId: string;
}) {
  const method = (data.method || 'CASH').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw new ApiError(400, `Invalid payment method. Use: ${[...ALLOWED_METHODS].join(', ')}`);
  }
  if (data.amountPaise <= 0) {
    throw new ApiError(400, 'Amount must be positive');
  }

  const installment = await prisma.installment.findFirst({
    where: { id: data.installmentId, group: { orgId: data.orgId } },
    include: {
      member: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          group: {
            select: {
              groupNumber: true,
              startDate: true,
              currentMonth: true,
              totalSeats: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!installment) throw new ApiError(404, 'Installment not found');

  const { member } = installment;
  const { customer, group } = member;

  if (installment.status === 'PAID' || installment.status === 'WAIVED') {
    throw new ApiError(400, 'Installment already settled');
  }

  if (BigInt(data.amountPaise) > installment.balancePaise) {
    throw new ApiError(
      400,
      `Amount exceeds balance. Outstanding: ₹${Number(installment.balancePaise) / 100}`,
    );
  }

  const receiptNumber = await generateReceiptNumber(member.groupId);
  const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        installmentId: data.installmentId,
        receiptNumber,
        amountPaise: BigInt(data.amountPaise),
        method: method as any,
        transactionRef: data.notes?.trim() || null,
        paymentDate,
        collectedById: data.collectedById,
        status: 'VERIFIED',
        verifiedAt: new Date(),
        verifiedById: data.collectedById,
      },
    });

    const newPaid = installment.paidAmountPaise + p.amountPaise;
    const newBalance = installment.netAmountPaise - newPaid;
    const fullyPaid = newBalance <= BigInt(0);

    await tx.installment.update({
      where: { id: data.installmentId },
      data: {
        paidAmountPaise: newPaid,
        balancePaise: newBalance < BigInt(0) ? BigInt(0) : newBalance,
        status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
        paidDate: fullyPaid ? new Date() : undefined,
      },
    });

    await tx.groupMember.update({
      where: { id: installment.memberId },
      data: { totalPaidPaise: { increment: p.amountPaise } },
    });

    await tx.chitGroup.update({
      where: { id: installment.groupId },
      data: { totalCollectedPaise: { increment: p.amountPaise } },
    });

    await tx.ledgerEntry.create({
      data: {
        groupId: installment.groupId,
        entryDate: new Date(),
        narration: `Cash collection - Receipt #${receiptNumber} (${method}) - Admin marked paid`,
        entryType: 'CREDIT',
        amountPaise: p.amountPaise,
        accountHead: 'COLLECTION',
        refType: 'payment',
        refId: p.id,
        memberId: installment.memberId,
        createdBy: data.collectedById,
      },
    });

    return p;
  });

  void audit.logAction({
    action: 'PAYMENT_MARKED_PAID',
    entityType: 'Payment',
    entityId: payment.id,
    actorId: data.collectedById,
    orgId: data.orgId,
    changes: { receiptNumber, amountPaise: data.amountPaise, method, notes: data.notes },
  }).catch(() => {});

  // Send payment received notification to customer
  const newBalance = installment.netAmountPaise - (installment.paidAmountPaise + BigInt(data.amountPaise));
  void notifications.notifyPaymentReceived({
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    amountPaise: data.amountPaise,
    groupName: group.product.name,
    groupNumber: group.groupNumber,
    monthLabel: getMonthLabel(group.startDate, installment.monthNumber),
    monthNumber: installment.monthNumber,
    receiptNumber,
    paymentDate,
    currentMonth: group.currentMonth,
    totalSeats: group.totalSeats,
    remainingBalancePaise: Math.max(Number(newBalance), 0),
    startDate: group.startDate,
  }).catch(() => {});

  return {
    id: payment.id,
    receiptNumber,
    message: 'Payment recorded and marked as paid',
  };
}

export async function getPaymentHistory(customerId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.payment.findMany({
      where: { installment: { member: { customerId } } },
      include: {
        installment: {
          select: {
            monthNumber: true,
            groupId: true,
            member: { select: { group: { select: { groupNumber: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.payment.count({
      where: { installment: { member: { customerId } } },
    }),
  ]);

  return {
    data,
    meta: {
      total, page, limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}
