import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenPayload, AuthTokens } from '@chitfund/shared';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // ====== STAFF AUTH ======

  async staffLogin(phone: string, password: string): Promise<{ user: any; tokens: AuthTokens }> {
    const staff = await this.prisma.staff.findFirst({ where: { phone } });
    if (!staff || !staff.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, staff.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.staff.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens({
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
        type: 'staff' as const,
      },
      tokens,
    };
  }

  async staffRegister(data: {
    email: string;
    phone: string;
    password: string;
    name: string;
    role: string;
    orgId: string;
    branchId?: string;
  }) {
    const existing = await this.prisma.staff.findFirst({
      where: { OR: [{ email: data.email }, { phone: data.phone }] },
    });
    if (existing) {
      throw new ConflictException('Email or phone already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const staff = await this.prisma.staff.create({
      data: {
        orgId: data.orgId,
        branchId: data.branchId,
        email: data.email,
        phone: data.phone,
        passwordHash,
        name: data.name,
        role: data.role as any,
      },
    });

    return { id: staff.id, name: staff.name, email: staff.email, role: staff.role };
  }

  // ====== CUSTOMER AUTH ======

  async resolveRegistrationOrgId(configuredOrgId?: string) {
    if (configuredOrgId) {
      const configured = await this.prisma.organization.findUnique({
        where: { id: configuredOrgId },
        select: { id: true },
      });
      if (configured) return configured.id;
    }

    const organization = await this.prisma.organization.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!organization) {
      throw new ConflictException('Member registration is not configured for an organization');
    }
    return organization.id;
  }

  async customerLogin(phone: string, password: string): Promise<{ user: any; tokens: AuthTokens }> {
    const customer = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null },
    });
    if (!customer || !customer.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, customer.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens({
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

  async customerRegister(data: {
    phone: string;
    email?: string;
    password: string;
    name: string;
    orgId: string;
  }) {
    const existing = await this.prisma.customer.findFirst({
      where: { orgId: data.orgId, phone: data.phone },
    });
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const customer = await this.prisma.customer.create({
      data: {
        orgId: data.orgId,
        phone: data.phone,
        email: data.email,
        passwordHash,
        name: data.name,
      },
    });

    const tokens = await this.generateTokens({
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

  // ====== REFRESH TOKEN ======

  async refreshTokens(payload: TokenPayload): Promise<AuthTokens> {
    if (payload.type === 'staff') {
      const staff = await this.prisma.staff.findUnique({ where: { id: payload.sub } });
      if (!staff || !staff.isActive || staff.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Token revoked');
      }
      return this.generateTokens({ ...payload, tokenVersion: staff.tokenVersion });
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: payload.sub } });
    if (!customer || !customer.isActive || customer.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Token revoked');
    }
    return this.generateTokens({ ...payload, tokenVersion: customer.tokenVersion });
  }

  // ====== VALIDATE TOKEN (used by JwtStrategy on every request) ======

  async validateToken(payload: TokenPayload) {
    if (payload.type === 'staff') {
      const staff = await this.prisma.staff.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, orgId: true, branchId: true, isActive: true, tokenVersion: true },
      });
      if (!staff || !staff.isActive || staff.tokenVersion !== payload.tokenVersion) {
        throw new UnauthorizedException('Token invalid or revoked');
      }
      return { ...staff, type: 'staff' as const };
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: payload.sub },
      select: { id: true, orgId: true, branchId: true, isActive: true, tokenVersion: true },
    });
    if (!customer || !customer.isActive || customer.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Token invalid or revoked');
    }
    return { ...customer, type: 'customer' as const, role: 'CUSTOMER' };
  }

  // ====== TOKEN GENERATION ======

  private async generateTokens(payload: TokenPayload): Promise<AuthTokens> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
