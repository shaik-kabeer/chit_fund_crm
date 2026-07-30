import { ApiError } from '../http';
import { prisma } from '../prisma';

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
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, installment: { group: { orgId } } },
    include: { installment: { include: { member: true } } },
  });
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status !== 'PENDING') {
    throw new ApiError(400, 'Payment is not in pending state');
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'VERIFIED', verifiedById, verifiedAt: new Date() },
    });

    const newPaid = payment.installment.paidAmountPaise + payment.amountPaise;
    const newBalance = payment.installment.netAmountPaise - newPaid;
    const fullyPaid = newBalance <= BigInt(0);

    await tx.installment.update({
      where: { id: payment.installmentId },
      data: {
        paidAmountPaise: newPaid,
        balancePaise: newBalance < BigInt(0) ? BigInt(0) : newBalance,
        status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
        paidDate: fullyPaid ? new Date() : undefined,
      },
    });

    await tx.groupMember.update({
      where: { id: payment.installment.memberId },
      data: { totalPaidPaise: { increment: payment.amountPaise } },
    });

    await tx.chitGroup.update({
      where: { id: payment.installment.groupId },
      data: { totalCollectedPaise: { increment: payment.amountPaise } },
    });

    await tx.ledgerEntry.create({
      data: {
        groupId: payment.installment.groupId,
        entryDate: new Date(),
        narration: `Payment received - Receipt #${payment.receiptNumber} (${payment.method})`,
        entryType: 'CREDIT',
        amountPaise: payment.amountPaise,
        accountHead: 'COLLECTION',
        refType: 'payment',
        refId: paymentId,
        memberId: payment.installment.memberId,
        createdBy: verifiedById,
      },
    });
  });

  return { message: 'Payment verified and marked as received' };
}

export async function rejectPayment(paymentId: string, reason: string, rejectedById: string, orgId: string) {
  if (!reason || reason.trim().length < 5) {
    throw new ApiError(400, 'Write a clear rejection review (minimum 5 characters)');
  }
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, installment: { group: { orgId } } },
    include: { installment: true },
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
