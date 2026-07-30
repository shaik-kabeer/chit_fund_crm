import type { AuthTokens, TokenPayload } from '@chitfund/shared';
import { hashPassword, verifyPassword, signTokens } from '../auth';
import { ApiError } from '../http';
import { prisma } from '../prisma';

async function generateTokens(payload: TokenPayload): Promise<AuthTokens> {
  return signTokens(payload);
}

export async function staffLogin(phone: string, password: string): Promise<{ user: any; tokens: AuthTokens }> {
  const staff = await prisma.staff.findFirst({ where: { phone } });
  if (!staff || !staff.isActive) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const valid = await verifyPassword(password, staff.passwordHash);
  if (!valid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  await prisma.staff.update({
    where: { id: staff.id },
    data: { lastLoginAt: new Date() },
  });

  const tokens = await generateTokens({
    sub: staff.id,
    type: 'staff',
    role: staff.role,
    orgId: staff.orgId,
    branchId: staff.branchId || undefined,
    tokenVersion: staff.tokenVersion,
  });

  return {
    user: {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      role: staff.role,
      orgId: staff.orgId,
      branchId: staff.branchId,
      type: 'staff' as const,
    },
    tokens,
  };
}

export async function resolveRegistrationOrgId(configuredOrgId?: string) {
  if (configuredOrgId) {
    const configured = await prisma.organization.findUnique({
      where: { id: configuredOrgId },
      select: { id: true },
    });
    if (configured) return configured.id;
  }

  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!organization) {
    throw new ApiError(409, 'Member registration is not configured for an organization');
  }
  return organization.id;
}

export async function customerLogin(phone: string, password: string): Promise<{ user: any; tokens: AuthTokens }> {
  const customer = await prisma.customer.findFirst({
    where: { phone, deletedAt: null },
  });
  if (!customer || !customer.isActive) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const valid = await verifyPassword(password, customer.passwordHash);
  if (!valid) {
    throw new ApiError(401, 'Invalid credentials');
  }

  const tokens = await generateTokens({
    sub: customer.id,
    type: 'customer',
    orgId: customer.orgId,
    branchId: customer.branchId || undefined,
    tokenVersion: customer.tokenVersion,
  });

  return {
    user: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      role: 'CUSTOMER',
      orgId: customer.orgId,
      type: 'customer' as const,
    },
    tokens,
  };
}

export async function customerRegister(data: {
  phone: string;
  email?: string;
  password: string;
  name: string;
  orgId: string;
}) {
  const existing = await prisma.customer.findFirst({
    where: { orgId: data.orgId, phone: data.phone },
  });
  if (existing) {
    throw new ApiError(409, 'Phone number already registered');
  }

  const passwordHash = await hashPassword(data.password);
  const customer = await prisma.customer.create({
    data: {
      orgId: data.orgId,
      phone: data.phone,
      email: data.email,
      passwordHash,
      name: data.name,
    },
  });

  const tokens = await generateTokens({
    sub: customer.id,
    type: 'customer',
    orgId: customer.orgId,
    tokenVersion: customer.tokenVersion,
  });

  return {
    user: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      role: 'CUSTOMER',
      orgId: customer.orgId,
      type: 'customer' as const,
    },
    tokens,
  };
}

export async function refreshTokens(payload: TokenPayload): Promise<AuthTokens> {
  if (payload.type === 'staff') {
    const staff = await prisma.staff.findUnique({ where: { id: payload.sub } });
    if (!staff || !staff.isActive || staff.tokenVersion !== payload.tokenVersion) {
      throw new ApiError(401, 'Token revoked');
    }
    return generateTokens({ ...payload, tokenVersion: staff.tokenVersion });
  }

  const customer = await prisma.customer.findUnique({ where: { id: payload.sub } });
  if (!customer || !customer.isActive || customer.tokenVersion !== payload.tokenVersion) {
    throw new ApiError(401, 'Token revoked');
  }
  return generateTokens({ ...payload, tokenVersion: customer.tokenVersion });
}

export async function changeCustomerPassword(
  customerId: string,
  currentPassword: string,
  newPassword: string,
) {
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Current password and new password are required');
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must contain at least 8 characters');
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || !customer.isActive) throw new ApiError(404, 'Customer not found');

  const valid = await verifyPassword(currentPassword, customer.passwordHash);
  if (!valid) throw new ApiError(400, 'Current password is incorrect');
  if (await verifyPassword(newPassword, customer.passwordHash)) {
    throw new ApiError(400, 'New password must be different from the current password');
  }

  await prisma.customer.update({
    where: { id: customerId },
    data: {
      passwordHash: await hashPassword(newPassword),
      tokenVersion: { increment: 1 },
    },
  });

  return { message: 'Password changed. Please sign in again.' };
}
