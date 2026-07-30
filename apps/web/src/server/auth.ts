import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { TokenPayload } from '@chitfund/shared';
import { prisma } from './prisma';
import { ApiError } from './http';

const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE = 'refreshToken';

function accessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new ApiError(500, 'JWT_ACCESS_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

function refreshSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new ApiError(500, 'JWT_REFRESH_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

function parseExpiry(value: string, fallbackSeconds: number) {
  const match = /^(\d+)([smhd])$/.exec(value || '');
  if (!match) return fallbackSeconds;
  const n = Number(match[1]);
  const unit = match[2];
  if (unit === 's') return n;
  if (unit === 'm') return n * 60;
  if (unit === 'h') return n * 3600;
  return n * 86400;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signTokens(payload: TokenPayload) {
  const accessExp = parseExpiry(process.env.JWT_ACCESS_EXPIRES_IN || '15m', 900);
  const refreshExp = parseExpiry(process.env.JWT_REFRESH_EXPIRES_IN || '7d', 604800);

  const [accessToken, refreshToken] = await Promise.all([
    new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${accessExp}s`)
      .sign(accessSecret()),
    new SignJWT({ ...payload })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${refreshExp}s`)
      .sign(refreshSecret()),
  ]);

  return { accessToken, refreshToken };
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret());
  return payload as unknown as TokenPayload;
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, refreshSecret());
  return payload as unknown as TokenPayload;
}

export function setRefreshCookie(response: Response, refreshToken: string) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = [
    `${REFRESH_COOKIE}=${refreshToken}`,
    'Path=/api/auth/refresh',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${7 * 24 * 60 * 60}`,
    isProd ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
  response.headers.append('Set-Cookie', cookie);
}

export function clearRefreshCookie(response: Response) {
  response.headers.append(
    'Set-Cookie',
    `${REFRESH_COOKIE}=; Path=/api/auth/refresh; HttpOnly; SameSite=Strict; Max-Age=0`,
  );
}

export type AuthUser = {
  id: string;
  orgId: string;
  branchId?: string | null;
  role: string;
  type: 'staff' | 'customer';
  name?: string;
};

async function validatePayload(payload: TokenPayload): Promise<AuthUser> {
  if (payload.type === 'staff') {
    const staff = await prisma.staff.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, orgId: true, branchId: true, isActive: true, tokenVersion: true, name: true },
    });
    if (!staff || !staff.isActive || staff.tokenVersion !== payload.tokenVersion) {
      throw new ApiError(401, 'Token invalid or revoked');
    }
    return {
      id: staff.id,
      orgId: staff.orgId,
      branchId: staff.branchId,
      role: staff.role,
      type: 'staff',
      name: staff.name,
    };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: payload.sub },
    select: { id: true, orgId: true, branchId: true, isActive: true, tokenVersion: true, name: true },
  });
  if (!customer || !customer.isActive || customer.tokenVersion !== payload.tokenVersion) {
    throw new ApiError(401, 'Token invalid or revoked');
  }
  return {
    id: customer.id,
    orgId: customer.orgId,
    branchId: customer.branchId,
    role: 'CUSTOMER',
    type: 'customer',
    name: customer.name,
  };
}

export async function requireAuth(request: Request): Promise<AuthUser> {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new ApiError(401, 'Unauthorized');
  try {
    const payload = await verifyAccessToken(token);
    return validatePayload(payload);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, 'Unauthorized');
  }
}

export async function requireStaff(request: Request, roles?: string[]) {
  const user = await requireAuth(request);
  if (user.type !== 'staff') throw new ApiError(403, 'Forbidden');
  if (roles && roles.length && !roles.includes(user.role)) {
    throw new ApiError(403, 'Forbidden');
  }
  return user;
}

export async function requireCustomer(request: Request) {
  const user = await requireAuth(request);
  if (user.type !== 'customer') throw new ApiError(403, 'Forbidden');
  return user;
}

export async function getRefreshPayloadFromCookies(): Promise<TokenPayload | null> {
  const jar = await cookies();
  const token = jar.get(REFRESH_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyRefreshToken(token);
  } catch {
    return null;
  }
}

export { REFRESH_COOKIE };
