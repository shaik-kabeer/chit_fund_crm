import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../__mocks__/prisma';

vi.mock('../prisma');
vi.mock('./audit.service', () => ({ logAction: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./notification.service', () => ({ send: vi.fn().mockResolvedValue(undefined) }));

import { submitPayment, markAsPaid } from './payment.service';

describe('Payment Service — Additional Edge Cases', () => {
  beforeEach(() => {
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
  });

  describe('submitPayment', () => {
    const baseInstallment = {
      id: 'inst-1',
      status: 'DUE',
      balancePaise: BigInt(500000),
      member: { customerId: 'cust-1', groupId: 'group-1' },
    };

    it('throws 400 for invalid payment method', async () => {
      await expect(submitPayment({
        installmentId: 'inst-1', amountPaise: 1000, method: 'BITCOIN',
        paymentDate: '2026-01-15',
      })).rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when screenshot missing for UPI', async () => {
      await expect(submitPayment({
        installmentId: 'inst-1', amountPaise: 1000, method: 'UPI',
        paymentDate: '2026-01-15',
      })).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('Screenshot'),
      });
    });

    it('throws 400 when UPI has no transaction ref', async () => {
      await expect(submitPayment({
        installmentId: 'inst-1', amountPaise: 1000, method: 'UPI',
        paymentDate: '2026-01-15', screenshotUrl: 'data:image/png;base64,abc',
      })).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('reference'),
      });
    });

    it('throws 404 when installment not found', async () => {
      prisma.installment.findUnique.mockResolvedValue(null);

      await expect(submitPayment({
        installmentId: 'x', amountPaise: 1000, method: 'CASH',
        paymentDate: '2026-01-15',
      })).rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when installment already settled (PAID)', async () => {
      prisma.installment.findUnique.mockResolvedValue({
        ...baseInstallment, status: 'PAID',
      } as never);

      await expect(submitPayment({
        installmentId: 'inst-1', amountPaise: 1000, method: 'CASH',
        paymentDate: '2026-01-15',
      })).rejects.toMatchObject({
        status: 400,
        message: 'Installment already settled',
      });
    });

    it('throws 409 when pending payment already exists', async () => {
      prisma.installment.findUnique.mockResolvedValue(baseInstallment as never);
      prisma.payment.findFirst.mockResolvedValue({ id: 'existing' } as never);

      await expect(submitPayment({
        installmentId: 'inst-1', amountPaise: 1000, method: 'CASH',
        paymentDate: '2026-01-15',
      })).rejects.toMatchObject({ status: 409 });
    });

    it('throws 400 when amount exceeds balance', async () => {
      prisma.installment.findUnique.mockResolvedValue(baseInstallment as never);
      prisma.payment.findFirst.mockResolvedValue(null); // no pending

      await expect(submitPayment({
        installmentId: 'inst-1', amountPaise: 9999999, method: 'CASH',
        paymentDate: '2026-01-15',
      })).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('exceeds balance'),
      });
    });

    it('throws 400 for zero/negative amount', async () => {
      prisma.installment.findUnique.mockResolvedValue(baseInstallment as never);
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(submitPayment({
        installmentId: 'inst-1', amountPaise: 0, method: 'CASH',
        paymentDate: '2026-01-15',
      })).rejects.toMatchObject({
        status: 400,
        message: 'Amount must be positive',
      });
    });

    it('throws 409 when transaction ref already used', async () => {
      prisma.installment.findUnique.mockResolvedValue(baseInstallment as never);
      prisma.payment.findFirst
        .mockResolvedValueOnce(null)  // no pending
        .mockResolvedValueOnce({ id: 'dup' } as never); // txn ref exists

      await expect(submitPayment({
        installmentId: 'inst-1', amountPaise: 5000, method: 'CASH',
        paymentDate: '2026-01-15', transactionRef: 'TXN123',
      })).rejects.toMatchObject({
        status: 409,
        message: 'Transaction reference already used',
      });
    });

    it('successfully creates payment for CASH (no screenshot needed)', async () => {
      prisma.installment.findUnique.mockResolvedValue(baseInstallment as never);
      prisma.payment.findFirst.mockResolvedValue(null);
      prisma.chitGroup.findUnique.mockResolvedValue({ orgId: 'org-1' } as never);
      prisma.receiptSequence.upsert.mockResolvedValue({ currentNumber: 42 } as never);
      prisma.payment.create.mockResolvedValue({
        id: 'pay-new', receiptNumber: 'RCP-00000042', status: 'PENDING',
      } as never);

      const result = await submitPayment({
        installmentId: 'inst-1', amountPaise: 100000, method: 'CASH',
        paymentDate: '2026-01-15',
      });

      expect(result.id).toBe('pay-new');
      expect(result.message).toContain('submitted');
    });
  });

  describe('markAsPaid', () => {
    const baseInstallment = {
      id: 'inst-1',
      groupId: 'group-1',
      memberId: 'member-1',
      status: 'DUE',
      paidAmountPaise: BigInt(0),
      netAmountPaise: BigInt(500000),
      balancePaise: BigInt(500000),
      member: { customerId: 'cust-1', groupId: 'group-1' },
    };

    it('creates verified payment immediately', async () => {
      prisma.installment.findFirst.mockResolvedValue(baseInstallment as never);
      prisma.chitGroup.findUnique.mockResolvedValue({ orgId: 'org-1' } as never);
      prisma.receiptSequence.upsert.mockResolvedValue({ currentNumber: 100 } as never);
      prisma.payment.create.mockResolvedValue({
        id: 'pay-1', receiptNumber: 'RCP-00000100', amountPaise: BigInt(500000),
      } as never);
      prisma.installment.update.mockResolvedValue({} as never);
      prisma.groupMember.update.mockResolvedValue({} as never);
      prisma.chitGroup.update.mockResolvedValue({} as never);
      prisma.ledgerEntry.create.mockResolvedValue({} as never);

      const result = await markAsPaid({
        installmentId: 'inst-1', amountPaise: 500000, method: 'CASH',
        collectedById: 'staff-1', orgId: 'org-1',
      });

      expect(result.receiptNumber).toBe('RCP-00000100');
      expect(result.message).toContain('marked as paid');
    });

    it('throws 400 for zero amount', async () => {
      await expect(markAsPaid({
        installmentId: 'i', amountPaise: 0, collectedById: 's', orgId: 'o',
      })).rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 for invalid method', async () => {
      await expect(markAsPaid({
        installmentId: 'i', amountPaise: 1000, method: 'CRYPTO',
        collectedById: 's', orgId: 'o',
      })).rejects.toMatchObject({ status: 400 });
    });

    it('throws 404 when installment not in org', async () => {
      prisma.installment.findFirst.mockResolvedValue(null);

      await expect(markAsPaid({
        installmentId: 'x', amountPaise: 1000, collectedById: 's', orgId: 'o',
      })).rejects.toMatchObject({ status: 404 });
    });

    it('throws 400 when already settled', async () => {
      prisma.installment.findFirst.mockResolvedValue({
        ...baseInstallment, status: 'PAID',
      } as never);

      await expect(markAsPaid({
        installmentId: 'inst-1', amountPaise: 1000, collectedById: 's', orgId: 'o',
      })).rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when amount exceeds balance', async () => {
      prisma.installment.findFirst.mockResolvedValue(baseInstallment as never);

      await expect(markAsPaid({
        installmentId: 'inst-1', amountPaise: 9999999, collectedById: 's', orgId: 'o',
      })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('exceeds') });
    });
  });
});
