import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MAX_COMMISSION_PERCENT } from '@chitfund/shared';

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(orgId: string, data: {
    name: string;
    description?: string;
    chitValuePaise: number;
    memberCount: number;
    tenureMonths: number;
    baseInstallmentPaise?: number;
    liftedInstallmentPaise?: number;
    payoutAmountPaise?: number;
    monthlyPayouts?: { monthNumber: number; payoutAmountPaise: number }[];
    commissionPercent?: number;
    createdBy?: string;
  }) {
    if (data.memberCount !== data.tenureMonths) {
      throw new BadRequestException('Member count must equal tenure months');
    }

    const commission = data.commissionPercent ?? 5;
    if (commission > MAX_COMMISSION_PERCENT) {
      throw new BadRequestException(`Commission cannot exceed ${MAX_COMMISSION_PERCENT}%`);
    }

    const baseInstallment = data.baseInstallmentPaise
      ?? Math.floor(data.chitValuePaise / data.tenureMonths);
    if (baseInstallment <= 0) {
      throw new BadRequestException('Installment must be positive');
    }

    const existing = await this.prisma.product.findUnique({
      where: { orgId_name: { orgId, name: data.name } },
    });
    if (existing) {
      throw new ConflictException('Product with this name already exists');
    }

    const liftedInstallment = data.liftedInstallmentPaise ?? baseInstallment;

    // Build monthly payout schedule — required for each month
    let schedule = data.monthlyPayouts || [];
    if (schedule.length === 0) {
      const defaultPayout = data.payoutAmountPaise ?? data.chitValuePaise;
      schedule = Array.from({ length: data.tenureMonths }, (_, i) => ({
        monthNumber: i + 1,
        payoutAmountPaise: defaultPayout,
      }));
    }

    if (schedule.length !== data.tenureMonths) {
      throw new BadRequestException(
        `Provide payout for all ${data.tenureMonths} months (got ${schedule.length})`,
      );
    }

    const months = new Set(schedule.map((s) => s.monthNumber));
    for (let m = 1; m <= data.tenureMonths; m++) {
      if (!months.has(m)) {
        throw new BadRequestException(`Missing payout for month ${m}`);
      }
    }
    for (const s of schedule) {
      if (!s.payoutAmountPaise || s.payoutAmountPaise <= 0) {
        throw new BadRequestException(`Payout for month ${s.monthNumber} must be positive`);
      }
    }

    // Default product-level payout = month 1 (legacy field kept for compatibility)
    const payoutAmount = schedule.find((s) => s.monthNumber === 1)!.payoutAmountPaise;

    return this.prisma.product.create({
      data: {
        orgId,
        name: data.name,
        description: data.description,
        chitValuePaise: BigInt(data.chitValuePaise),
        memberCount: data.memberCount,
        tenureMonths: data.tenureMonths,
        baseInstallmentPaise: BigInt(baseInstallment),
        liftedInstallmentPaise: BigInt(liftedInstallment),
        payoutAmountPaise: BigInt(payoutAmount),
        commissionPercent: commission,
        createdBy: data.createdBy,
        payoutSchedule: {
          create: schedule.map((s) => ({
            monthNumber: s.monthNumber,
            payoutAmountPaise: BigInt(s.payoutAmountPaise),
          })),
        },
      },
      include: { payoutSchedule: { orderBy: { monthNumber: 'asc' } } },
    });
  }

  async findAll(orgId: string, includeInactive = false) {
    return this.prisma.product.findMany({
      where: {
        orgId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { groups: true } },
        payoutSchedule: { orderBy: { monthNumber: 'asc' } },
      },
    });
  }

  async findById(orgId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, orgId },
      include: {
        groups: { orderBy: { createdAt: 'desc' }, take: 10 },
        penaltyRules: { where: { isActive: true } },
        payoutSchedule: { orderBy: { monthNumber: 'asc' } },
        _count: { select: { groups: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(orgId: string, id: string, data: Partial<{
    name: string;
    description: string;
    chitValuePaise: number;
    memberCount: number;
    tenureMonths: number;
    baseInstallmentPaise: number;
    liftedInstallmentPaise: number;
    commissionPercent: number;
    isActive: boolean;
    monthlyPayouts: { monthNumber: number; payoutAmountPaise: number }[];
  }>) {
    const product = await this.prisma.product.findFirst({ where: { id, orgId } });
    if (!product) throw new NotFoundException('Product not found');

    const [groupCount, runningGroupCount] = await Promise.all([
      this.prisma.chitGroup.count({ where: { productId: id } }),
      this.prisma.chitGroup.count({
        where: { productId: id, status: { in: ['ACTIVE', 'OPEN', 'FROZEN'] } },
      }),
    ]);

    const structureChanged = data.chitValuePaise !== undefined
      || data.memberCount !== undefined
      || data.tenureMonths !== undefined;
    if (structureChanged && groupCount > 0) {
      throw new BadRequestException(
        'Chit value, member count and tenure cannot change after groups are created',
      );
    }

    const financialsChanged = data.baseInstallmentPaise !== undefined
      || data.liftedInstallmentPaise !== undefined
      || data.monthlyPayouts !== undefined;
    if (financialsChanged && runningGroupCount > 0) {
      throw new BadRequestException('EMIs and payout schedule cannot change while groups are open or active');
    }

    const tenure = data.tenureMonths ?? product.tenureMonths;
    const memberCount = data.memberCount ?? product.memberCount;
    if (memberCount !== tenure) {
      throw new BadRequestException('Member count must equal tenure months');
    }

    if (data.monthlyPayouts) {
      if (data.monthlyPayouts.length !== tenure) {
        throw new BadRequestException(`Must provide ${tenure} monthly payouts`);
      }
      const months = new Set(data.monthlyPayouts.map((entry) => entry.monthNumber));
      for (let month = 1; month <= tenure; month++) {
        if (!months.has(month)) throw new BadRequestException(`Missing payout for month ${month}`);
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.productPayoutSchedule.deleteMany({ where: { productId: id } });
        await tx.productPayoutSchedule.createMany({
          data: data.monthlyPayouts!.map((s) => ({
            productId: id,
            monthNumber: s.monthNumber,
            payoutAmountPaise: BigInt(s.payoutAmountPaise),
          })),
        });
      });
    }

    const { monthlyPayouts: _, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };
    for (const key of ['chitValuePaise', 'baseInstallmentPaise', 'liftedInstallmentPaise']) {
      if (updateData[key] !== undefined) updateData[key] = BigInt(updateData[key] as number);
    }
    if (data.monthlyPayouts?.length) {
      updateData.payoutAmountPaise = BigInt(data.monthlyPayouts[0].payoutAmountPaise);
    }
    return this.prisma.product.update({
      where: { id },
      data: updateData,
      include: { payoutSchedule: { orderBy: { monthNumber: 'asc' } } },
    });
  }

  async toggleActive(orgId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, orgId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({
      where: { id },
      data: { isActive: !product.isActive },
    });
  }
}
