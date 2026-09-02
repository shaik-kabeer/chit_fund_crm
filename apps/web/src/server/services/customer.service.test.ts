import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../http';
import { prisma } from '../__mocks__/prisma';

vi.mock('../prisma');
vi.mock('../auth', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_new_password'),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));
vi.mock('./audit.service', () => ({ logAction: vi.fn().mockResolvedValue(undefined) }));

import { createByAdmin, findAll, findById, getProfile, updateProfile, resetPassword, updateKycStatus } from './customer.service';

describe('Customer Service', () => {
  const orgId = 'org-1';
  const staffId = 'staff-1';

  describe('createByAdmin', () => {
    it('creates customer with generated password', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({
        id: 'cust-new', name: 'Test Member', phone: '9876543210',
        email: null, kycStatus: 'PENDING', createdAt: new Date(),
      } as never);

      const result = await createByAdmin(orgId, staffId, {
        name: 'Test Member', phone: '9876543210',
      });

      expect(result.customer.id).toBe('cust-new');
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    });

    it('throws 409 when phone already exists', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'existing' } as never);

      await expect(createByAdmin(orgId, staffId, {
        name: 'Test', phone: '9876543210',
      })).rejects.toMatchObject({
        status: 409,
        message: 'A member with this phone number already exists',
      });
    });

    it('throws 400 when name is too short', async () => {
      await expect(createByAdmin(orgId, staffId, {
        name: 'A', phone: '9876543210',
      })).rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when phone is invalid (too short)', async () => {
      await expect(createByAdmin(orgId, staffId, {
        name: 'Valid Name', phone: '123',
      })).rejects.toMatchObject({ status: 400 });
    });

    it('throws 400 when provided password is too short', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(createByAdmin(orgId, staffId, {
        name: 'Test', phone: '9876543210', password: 'short',
      })).rejects.toMatchObject({ status: 400 });
    });

    it('strips non-digit chars from phone', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({
        id: 'cust-new', name: 'Test', phone: '9876543210',
        email: null, kycStatus: 'PENDING', createdAt: new Date(),
      } as never);

      await createByAdmin(orgId, staffId, {
        name: 'Test Name', phone: '+91-98765-43210',
      });

      expect(prisma.customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: '919876543210' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated customers', async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }] as never);
      prisma.customer.count.mockResolvedValue(2);

      const result = await findAll(orgId, 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
    });

    it('applies search filter', async () => {
      prisma.customer.findMany.mockResolvedValue([] as never);
      prisma.customer.count.mockResolvedValue(0);

      await findAll(orgId, 1, 20, 'john');

      expect(prisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: { contains: 'john', mode: 'insensitive' } }),
            ]),
          }),
        }),
      );
    });

    it('respects pagination params', async () => {
      prisma.customer.findMany.mockResolvedValue([] as never);
      prisma.customer.count.mockResolvedValue(50);

      const result = await findAll(orgId, 3, 10);

      expect(result.meta.page).toBe(3);
      expect(result.meta.totalPages).toBe(5);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(true);
    });
  });

  describe('findById', () => {
    it('returns customer with memberships', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-1',
        name: 'Test',
        memberships: [{
          id: 'mem-1', status: 'ACTIVE', prizedMonth: null, prizedAt: null,
          group: { product: { baseInstallmentPaise: BigInt(1000), liftedInstallmentPaise: BigInt(800), payoutAmountPaise: BigInt(50000), payoutSchedule: [] } },
          installments: [], payouts: [],
        }],
      } as never);

      const result = await findById(orgId, 'cust-1');

      expect(result.id).toBe('cust-1');
      expect(result.memberships).toHaveLength(1);
    });

    it('throws 404 when not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(findById(orgId, 'nonexistent')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getProfile', () => {
    it('returns profile data', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'cust-1', name: 'Test' } as never);

      const result = await getProfile('cust-1');
      expect(result.id).toBe('cust-1');
    });

    it('throws 404 when not found', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(getProfile('x')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('updateProfile', () => {
    it('only updates allowed fields', async () => {
      prisma.customer.update.mockResolvedValue({} as never);

      await updateProfile('cust-1', {
        name: 'New Name',
        passwordHash: 'HACKED',  // not allowed
        isActive: false,          // not allowed
        orgId: 'other-org',       // not allowed
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { name: 'New Name' },
      });
    });
  });

  describe('resetPassword', () => {
    it('generates a new temporary password', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' } as never);
      prisma.customer.update.mockResolvedValue({} as never);

      const result = await resetPassword(orgId, 'cust-1');

      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(8);
      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cust-1' },
          data: expect.objectContaining({ tokenVersion: { increment: 1 } }),
        }),
      );
    });

    it('throws 404 when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(resetPassword(orgId, 'x')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('updateKycStatus', () => {
    it('verifies KYC', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-1', kycStatus: 'SUBMITTED',
      } as never);
      prisma.customer.update.mockResolvedValue({ id: 'cust-1', kycStatus: 'VERIFIED' } as never);

      const result = await updateKycStatus(orgId, 'cust-1', 'VERIFIED', staffId);

      expect(result.kycStatus).toBe('VERIFIED');
    });

    it('rejects KYC with reason', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-1', kycStatus: 'SUBMITTED',
      } as never);
      prisma.customer.update.mockResolvedValue({ id: 'cust-1', kycStatus: 'REJECTED' } as never);

      await updateKycStatus(orgId, 'cust-1', 'REJECTED', staffId, 'Documents unclear');

      expect(prisma.customer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kycStatus: 'REJECTED',
            kycRejectionReason: 'Documents unclear',
          }),
        }),
      );
    });

    it('throws 404 when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(updateKycStatus(orgId, 'x', 'VERIFIED', staffId)).rejects.toMatchObject({ status: 404 });
    });
  });
});
