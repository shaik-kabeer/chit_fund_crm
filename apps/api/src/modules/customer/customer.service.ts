import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class CustomerService {
  constructor(private prisma: PrismaService) {}

  async createByAdmin(
    orgId: string,
    createdById: string,
    data: { name: string; phone: string; email?: string; password?: string; branchId?: string },
  ) {
    const name = data.name?.trim();
    const phone = data.phone?.replace(/\D/g, '');
    if (!name || name.length < 2) throw new BadRequestException('Name is required');
    if (!phone || phone.length < 10) throw new BadRequestException('Enter a valid phone number');

    const existing = await this.prisma.customer.findFirst({ where: { orgId, phone } });
    if (existing) throw new ConflictException('A member with this phone number already exists');

    const temporaryPassword = data.password?.trim()
      || `Stash@${randomBytes(4).toString('hex')}`;
    if (temporaryPassword.length < 8) {
      throw new BadRequestException('Temporary password must contain at least 8 characters');
    }

    const customer = await this.prisma.customer.create({
      data: {
        orgId,
        branchId: data.branchId || null,
        name,
        phone,
        email: data.email?.trim() || null,
        passwordHash: await bcrypt.hash(temporaryPassword, 12),
        createdById,
      },
      select: {
        id: true, name: true, phone: true, email: true, kycStatus: true, createdAt: true,
      },
    });

    return { customer, temporaryPassword };
  }

  async findAll(orgId: string, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { orgId, deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        select: {
          id: true, name: true, phone: true, email: true, kycStatus: true, isActive: true, createdAt: true,
          // Rejected/withdrawn seats must not inflate the customer's chit count
          _count: {
            select: {
              memberships: {
                where: { status: { notIn: ['REJECTED', 'WITHDRAWN'] } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } };
  }

  async findById(orgId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        memberships: {
          include: {
            group: {
              include: {
                product: {
                  select: {
                    name: true,
                    chitValuePaise: true,
                    tenureMonths: true,
                    baseInstallmentPaise: true,
                    liftedInstallmentPaise: true,
                    payoutAmountPaise: true,
                    payoutSchedule: { orderBy: { monthNumber: 'asc' } },
                  },
                },
              },
            },
            installments: {
              orderBy: { monthNumber: 'asc' },
              include: {
                payments: { orderBy: { paymentDate: 'asc' } },
              },
            },
            payouts: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // Enrich each membership with EMI change info
    const memberships = customer.memberships.map((m) => {
      const product = m.group.product;
      const lifted = m.status === 'PRIZED' || m.status === 'COMPLETED';
      return {
        ...m,
        emiBeforeLiftPaise: product.baseInstallmentPaise,
        emiAfterLiftPaise: product.liftedInstallmentPaise,
        currentEmiPaise: lifted ? product.liftedInstallmentPaise : product.baseInstallmentPaise,
        liftInfo: lifted
          ? {
              prizedMonth: m.prizedMonth,
              prizedAt: m.prizedAt,
              payoutReceived: m.payouts[0] || null,
              schedulePayoutPaise: m.prizedMonth
                ? product.payoutSchedule.find((s) => s.monthNumber === m.prizedMonth)?.payoutAmountPaise
                  ?? product.payoutAmountPaise
                : null,
            }
          : null,
      };
    });

    return { ...customer, memberships };
  }

  async getProfile(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true, name: true, phone: true, email: true, fatherName: true, dateOfBirth: true,
        pan: true, aadhaarLast4: true, address: true, city: true, state: true, pincode: true,
        kycStatus: true, bankName: true, bankAccountNo: true, bankIfsc: true, bankBranch: true, upiId: true,
        kycSubmittedAt: true, kycVerifiedAt: true, kycRejectionReason: true,
        photoUrl: true, createdAt: true,
      },
    });
    if (!customer) throw new NotFoundException('Profile not found');
    return customer;
  }

  async updateProfile(customerId: string, data: Record<string, any>) {
    const allowed = [
      'name', 'fatherName', 'email', 'dateOfBirth', 'address', 'city',
      'state', 'pincode', 'photoUrl',
    ];
    const filtered = Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
    if (filtered.dateOfBirth) filtered.dateOfBirth = new Date(filtered.dateOfBirth as string);
    return this.prisma.customer.update({ where: { id: customerId }, data: filtered });
  }

  async updateBankDetails(customerId: string, data: {
    bankName?: string;
    bankAccountNo?: string;
    bankIfsc?: string;
    bankBranch?: string;
    upiId?: string;
  }) {
    const normalize = (value?: string) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    };
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        bankName: normalize(data.bankName),
        bankAccountNo: normalize(data.bankAccountNo),
        bankIfsc: normalize(data.bankIfsc),
        bankBranch: normalize(data.bankBranch),
        upiId: normalize(data.upiId),
      },
    });
  }

  async updateByAdmin(orgId: string, customerId: string, data: Record<string, any>) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, orgId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const allowed = [
      'name', 'phone', 'email', 'fatherName', 'dateOfBirth', 'address', 'city',
      'state', 'pincode', 'bankName', 'bankAccountNo', 'bankIfsc', 'bankBranch',
      'upiId', 'isActive', 'branchId',
    ];
    const filtered = Object.fromEntries(
      Object.entries(data).filter(([key]) => allowed.includes(key)),
    );
    if (filtered.phone) {
      filtered.phone = String(filtered.phone).replace(/\D/g, '');
      const duplicate = await this.prisma.customer.findFirst({
        where: { orgId, phone: filtered.phone as string, id: { not: customerId } },
      });
      if (duplicate) throw new ConflictException('Phone number already belongs to another member');
    }
    if (filtered.dateOfBirth) filtered.dateOfBirth = new Date(filtered.dateOfBirth as string);

    return this.prisma.customer.update({ where: { id: customerId }, data: filtered });
  }

  async submitKyc(customerId: string, data: Record<string, any>) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { kycStatus: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.kycStatus === 'VERIFIED') {
      throw new BadRequestException('Verified KYC cannot be changed without an admin review');
    }
    if (customer.kycStatus === 'SUBMITTED') {
      throw new BadRequestException('KYC is already awaiting review');
    }

    // All KYC fields are optional — validate format only when a value is provided
    const trimOrNull = (value: unknown) => {
      const text = String(value ?? '').trim();
      return text.length ? text : null;
    };

    const name = trimOrNull(data.name);
    const fatherName = trimOrNull(data.fatherName);
    const address = trimOrNull(data.address);
    const city = trimOrNull(data.city);
    const state = trimOrNull(data.state);
    const pincode = trimOrNull(data.pincode);
    const panRaw = trimOrNull(data.pan);
    const aadhaarRaw = trimOrNull(data.aadhaarLast4);
    const dobRaw = trimOrNull(data.dateOfBirth);

    const pan = panRaw ? panRaw.toUpperCase() : null;
    const aadhaarLast4 = aadhaarRaw ? aadhaarRaw.replace(/\D/g, '') : null;
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      throw new BadRequestException('Enter a valid PAN (e.g. ABCDE1234F)');
    }
    if (aadhaarLast4 && !/^\d{4}$/.test(aadhaarLast4)) {
      throw new BadRequestException('Aadhaar last 4 digits must be exactly 4 numbers');
    }

    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(name ? { name } : {}),
        fatherName,
        dateOfBirth: dobRaw ? new Date(dobRaw) : null,
        pan,
        aadhaarLast4,
        address,
        city,
        state,
        pincode,
        photoUrl: data.photoUrl || undefined,
        kycStatus: 'SUBMITTED',
        kycSubmittedAt: new Date(),
        kycVerifiedAt: null,
        kycVerifiedBy: null,
        kycRejectionReason: null,
      },
    });
  }

  async updateKycStatus(
    orgId: string,
    customerId: string,
    status: string,
    verifiedById: string,
    reason?: string,
  ) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, orgId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      throw new BadRequestException('KYC can only be verified or rejected');
    }
    if (customer.kycStatus !== 'SUBMITTED') {
      throw new BadRequestException('Only submitted KYC can be reviewed');
    }
    if (status === 'REJECTED' && (!reason || reason.trim().length < 5)) {
      throw new BadRequestException('Write a clear rejection reason (minimum 5 characters)');
    }

    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        kycStatus: status as any,
        kycVerifiedAt: status === 'VERIFIED' ? new Date() : null,
        kycVerifiedBy: verifiedById,
        kycRejectionReason: status === 'REJECTED' ? reason!.trim() : null,
      },
    });
  }
}
