import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../http';
import { prisma } from '../__mocks__/prisma';

vi.mock('../prisma');

// Mock auth module
vi.mock('../auth', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed_password'),
  verifyPassword: vi.fn(),
  signTokens: vi.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
}));

import { staffLogin, customerLogin, customerRegister, changeCustomerPassword, refreshTokens } from './auth.service';
import { verifyPassword } from '../auth';

const mockVerifyPassword = verifyPassword as ReturnType<typeof vi.fn>;

describe('Auth Service', () => {
  describe('staffLogin', () => {
    const mockStaff = {
      id: 'staff-1',
      orgId: 'org-1',
      branchId: 'branch-1',
      email: 'admin@test.com',
      phone: '9876500001',
      passwordHash: 'hashed',
      name: 'Admin User',
      role: 'SUPER_ADMIN',
      isActive: true,
      tokenVersion: 0,
    };

    it('succeeds with valid phone and password', async () => {
      prisma.staff.findFirst.mockResolvedValue(mockStaff as never);
      mockVerifyPassword.mockResolvedValue(true);
      prisma.staff.update.mockResolvedValue(mockStaff as never);

      const result = await staffLogin('9876500001', 'Admin@123');

      expect(result.user.id).toBe('staff-1');
      expect(result.user.role).toBe('SUPER_ADMIN');
      expect(result.user.type).toBe('staff');
      expect(result.tokens.accessToken).toBe('at');
      expect(prisma.staff.update).toHaveBeenCalledWith({
        where: { id: 'staff-1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });

    it('throws 401 when staff not found', async () => {
      prisma.staff.findFirst.mockResolvedValue(null);

      await expect(staffLogin('0000000000', 'pw')).rejects.toMatchObject({
        status: 401,
        message: 'Invalid credentials',
      });
    });

    it('throws 401 when staff is inactive', async () => {
      prisma.staff.findFirst.mockResolvedValue({ ...mockStaff, isActive: false } as never);

      await expect(staffLogin('9876500001', 'pw')).rejects.toMatchObject({
        status: 401,
        message: 'Invalid credentials',
      });
    });

    it('throws 401 when password is wrong', async () => {
      prisma.staff.findFirst.mockResolvedValue(mockStaff as never);
      mockVerifyPassword.mockResolvedValue(false);

      await expect(staffLogin('9876500001', 'wrong')).rejects.toMatchObject({
        status: 401,
        message: 'Invalid credentials',
      });
    });
  });

  describe('customerLogin', () => {
    const mockCustomer = {
      id: 'cust-1',
      orgId: 'org-1',
      branchId: null,
      email: null,
      phone: '9876500010',
      passwordHash: 'hashed',
      name: 'John Doe',
      isActive: true,
      tokenVersion: 0,
      deletedAt: null,
    };

    it('succeeds with valid credentials', async () => {
      prisma.customer.findFirst.mockResolvedValue(mockCustomer as never);
      mockVerifyPassword.mockResolvedValue(true);

      const result = await customerLogin('9876500010', 'password123');

      expect(result.user.id).toBe('cust-1');
      expect(result.user.role).toBe('CUSTOMER');
      expect(result.user.type).toBe('customer');
    });

    it('throws 401 when customer not found', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(customerLogin('0000000000', 'pw')).rejects.toMatchObject({
        status: 401,
        message: 'Invalid credentials',
      });
    });

    it('throws 401 when customer is inactive', async () => {
      prisma.customer.findFirst.mockResolvedValue({ ...mockCustomer, isActive: false } as never);

      await expect(customerLogin('9876500010', 'pw')).rejects.toMatchObject({
        status: 401,
        message: 'Invalid credentials',
      });
    });

    it('throws 401 on wrong password', async () => {
      prisma.customer.findFirst.mockResolvedValue(mockCustomer as never);
      mockVerifyPassword.mockResolvedValue(false);

      await expect(customerLogin('9876500010', 'wrong')).rejects.toMatchObject({
        status: 401,
      });
    });
  });

  describe('customerRegister', () => {
    it('creates customer and returns tokens on success', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({
        id: 'new-1', name: 'New User', phone: '9999888877',
        email: null, orgId: 'org-1', tokenVersion: 0,
      } as never);

      const result = await customerRegister({
        phone: '9999888877', password: 'StrongPass1', name: 'New User', orgId: 'org-1',
      });

      expect(result.user.phone).toBe('9999888877');
      expect(result.tokens).toBeDefined();
      expect(prisma.customer.create).toHaveBeenCalled();
    });

    it('throws 409 when phone already exists', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'existing' } as never);

      await expect(customerRegister({
        phone: '9999888877', password: 'pw', name: 'X', orgId: 'org-1',
      })).rejects.toMatchObject({
        status: 409,
        message: 'Phone number already registered',
      });
    });
  });

  describe('changeCustomerPassword', () => {
    const mockCustomer = {
      id: 'cust-1', isActive: true, passwordHash: 'old_hash',
    };

    it('changes password when current password is correct', async () => {
      prisma.customer.findUnique.mockResolvedValue(mockCustomer as never);
      mockVerifyPassword
        .mockResolvedValueOnce(true)   // current password correct
        .mockResolvedValueOnce(false); // new password is different
      prisma.customer.update.mockResolvedValue({} as never);

      const result = await changeCustomerPassword('cust-1', 'OldPass1', 'NewPass99');

      expect(result.message).toContain('Password changed');
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: {
          passwordHash: 'hashed_password',
          tokenVersion: { increment: 1 },
        },
      });
    });

    it('throws 400 when current password is wrong', async () => {
      prisma.customer.findUnique.mockResolvedValue(mockCustomer as never);
      mockVerifyPassword.mockResolvedValue(false);

      await expect(changeCustomerPassword('cust-1', 'Wrong', 'NewPass99')).rejects.toMatchObject({
        status: 400,
        message: 'Current password is incorrect',
      });
    });

    it('throws 400 when new password same as current', async () => {
      prisma.customer.findUnique.mockResolvedValue(mockCustomer as never);
      mockVerifyPassword
        .mockResolvedValueOnce(true)  // current correct
        .mockResolvedValueOnce(true); // new matches current

      await expect(changeCustomerPassword('cust-1', 'SamePass1', 'SamePass1')).rejects.toMatchObject({
        status: 400,
        message: 'New password must be different from the current password',
      });
    });

    it('throws 400 when new password is too short', async () => {
      await expect(changeCustomerPassword('cust-1', 'current', 'short')).rejects.toMatchObject({
        status: 400,
        message: 'New password must contain at least 8 characters',
      });
    });

    it('throws 400 when passwords are empty', async () => {
      await expect(changeCustomerPassword('cust-1', '', 'NewPass99')).rejects.toMatchObject({
        status: 400,
      });
    });

    it('throws 404 when customer not found', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(changeCustomerPassword('x', 'a', 'NewPass99')).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('refreshTokens', () => {
    it('refreshes staff token when valid', async () => {
      prisma.staff.findUnique.mockResolvedValue({
        id: 'staff-1', isActive: true, tokenVersion: 1,
      } as never);

      const result = await refreshTokens({
        sub: 'staff-1', type: 'staff', orgId: 'org-1', tokenVersion: 1,
      });

      expect(result.accessToken).toBe('at');
    });

    it('throws 401 when staff token version mismatch', async () => {
      prisma.staff.findUnique.mockResolvedValue({
        id: 'staff-1', isActive: true, tokenVersion: 2,
      } as never);

      await expect(refreshTokens({
        sub: 'staff-1', type: 'staff', orgId: 'org-1', tokenVersion: 1,
      })).rejects.toMatchObject({ status: 401 });
    });

    it('refreshes customer token when valid', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1', isActive: true, tokenVersion: 0,
      } as never);

      const result = await refreshTokens({
        sub: 'cust-1', type: 'customer', orgId: 'org-1', tokenVersion: 0,
      });

      expect(result.accessToken).toBe('at');
    });

    it('throws 401 when customer is inactive', async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: 'cust-1', isActive: false, tokenVersion: 0,
      } as never);

      await expect(refreshTokens({
        sub: 'cust-1', type: 'customer', orgId: 'org-1', tokenVersion: 0,
      })).rejects.toMatchObject({ status: 401 });
    });
  });
});
