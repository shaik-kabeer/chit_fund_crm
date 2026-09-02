import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../http';
import { prisma } from '../__mocks__/prisma';
import { rejectPayment, verifyPayment } from './payment.service';

vi.mock('../prisma');
vi.mock('./audit.service', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

const paymentId = 'pay-1';
const verifiedById = 'staff-1';
const rejectedById = 'staff-2';
const orgId = 'org-1';

function makePendingPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: paymentId,
    status: 'PENDING',
    amountPaise: BigInt(500000),
    receiptNumber: 'RCP-00000001',
    method: 'UPI',
    installmentId: 'inst-1',
    installment: {
      id: 'inst-1',
      memberId: 'member-1',
      groupId: 'group-1',
      paidAmountPaise: BigInt(0),
      netAmountPaise: BigInt(500000),
      member: { id: 'member-1', groupId: 'group-1' },
    },
    ...overrides,
  };
}

beforeEach(() => {
  prisma.$transaction.mockImplementation(async (callback) =>
    callback(prisma),
  );
});

describe('verifyPayment', () => {
  it('updates payment, installment, member, group, and creates ledger entry', async () => {
    const payment = makePendingPayment();
    prisma.payment.findFirst.mockResolvedValue(payment as never);
    prisma.payment.update.mockResolvedValue({} as never);
    prisma.installment.update.mockResolvedValue({} as never);
    prisma.groupMember.update.mockResolvedValue({} as never);
    prisma.chitGroup.update.mockResolvedValue({} as never);
    prisma.ledgerEntry.create.mockResolvedValue({} as never);

    const result = await verifyPayment(paymentId, verifiedById, orgId);

    expect(result).toEqual({ message: 'Payment verified and marked as received' });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: expect.objectContaining({
        status: 'VERIFIED',
        verifiedById,
        verifiedAt: expect.any(Date),
      }),
    });
    expect(prisma.installment.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: expect.objectContaining({
        paidAmountPaise: BigInt(500000),
        balancePaise: BigInt(0),
        status: 'PAID',
        paidDate: expect.any(Date),
      }),
    });
    expect(prisma.groupMember.update).toHaveBeenCalledWith({
      where: { id: 'member-1' },
      data: { totalPaidPaise: { increment: BigInt(500000) } },
    });
    expect(prisma.chitGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { totalCollectedPaise: { increment: BigInt(500000) } },
    });
    expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: 'group-1',
        entryType: 'CREDIT',
        amountPaise: BigInt(500000),
        accountHead: 'COLLECTION',
        refType: 'payment',
        refId: paymentId,
        memberId: 'member-1',
        createdBy: verifiedById,
      }),
    });
  });

  it('throws 404 when payment is not found', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);

    await expect(verifyPayment(paymentId, verifiedById, orgId)).rejects.toMatchObject({
      status: 404,
      message: 'Payment not found',
    } satisfies Partial<ApiError>);
  });

  it('throws 400 when payment is already verified', async () => {
    prisma.payment.findFirst.mockResolvedValue(
      makePendingPayment({ status: 'VERIFIED' }) as never,
    );

    await expect(verifyPayment(paymentId, verifiedById, orgId)).rejects.toMatchObject({
      status: 400,
      message: 'Payment is not in pending state',
    } satisfies Partial<ApiError>);
  });
});

describe('rejectPayment', () => {
  it('updates payment status and stores rejection reason', async () => {
    const payment = makePendingPayment();
    prisma.payment.findFirst.mockResolvedValue(payment as never);
    prisma.payment.update.mockResolvedValue({} as never);

    const result = await rejectPayment(
      paymentId,
      'Invalid screenshot provided',
      rejectedById,
      orgId,
    );

    expect(result).toEqual({ message: 'Payment request rejected' });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: {
        status: 'REJECTED',
        rejectedAt: expect.any(Date),
        rejectionReason: 'Invalid screenshot provided',
      },
    });
  });

  it('throws 400 when rejection reason is too short', async () => {
    await expect(rejectPayment(paymentId, 'bad', rejectedById, orgId)).rejects.toMatchObject({
      status: 400,
      message: 'Write a clear rejection review (minimum 5 characters)',
    } satisfies Partial<ApiError>);

    expect(prisma.payment.findFirst).not.toHaveBeenCalled();
  });
});
