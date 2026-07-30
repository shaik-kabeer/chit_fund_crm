import { MAX_COMMISSION_PERCENT } from '@chitfund/shared';
import { ApiError } from '../http';
import { prisma } from '../prisma';

export async function create(orgId: string, data: {
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
    throw new ApiError(400, 'Member count must equal tenure months');
  }

  const commission = data.commissionPercent ?? 5;
  if (commission > MAX_COMMISSION_PERCENT) {
    throw new ApiError(400, `Commission cannot exceed ${MAX_COMMISSION_PERCENT}%`);
  }

  const baseInstallment = data.baseInstallmentPaise
    ?? Math.floor(data.chitValuePaise / data.tenureMonths);
  if (baseInstallment <= 0) {
    throw new ApiError(400, 'Installment must be positive');
  }

  const existing = await prisma.product.findUnique({
    where: { orgId_name: { orgId, name: data.name } },
  });
  if (existing) {
    throw new ApiError(409, 'Product with this name already exists');
  }

  const liftedInstallment = data.liftedInstallmentPaise ?? baseInstallment;

  let schedule = data.monthlyPayouts || [];
  if (schedule.length === 0) {
    const defaultPayout = data.payoutAmountPaise ?? data.chitValuePaise;
    schedule = Array.from({ length: data.tenureMonths }, (_, i) => ({
      monthNumber: i + 1,
      payoutAmountPaise: defaultPayout,
    }));
  }

  if (schedule.length !== data.tenureMonths) {
    throw new ApiError(
      400,
      `Provide payout for all ${data.tenureMonths} months (got ${schedule.length})`,
    );
  }

  const months = new Set(schedule.map((s) => s.monthNumber));
  for (let m = 1; m <= data.tenureMonths; m++) {
    if (!months.has(m)) {
      throw new ApiError(400, `Missing payout for month ${m}`);
    }
  }
  for (const s of schedule) {
    if (!s.payoutAmountPaise || s.payoutAmountPaise <= 0) {
      throw new ApiError(400, `Payout for month ${s.monthNumber} must be positive`);
    }
  }

  const payoutAmount = schedule.find((s) => s.monthNumber === 1)!.payoutAmountPaise;

  return prisma.product.create({
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

export async function findAll(orgId: string, includeInactive = false) {
  return prisma.product.findMany({
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

export async function findById(orgId: string, id: string) {
  const product = await prisma.product.findFirst({
    where: { id, orgId },
    include: {
      groups: { orderBy: { createdAt: 'desc' }, take: 10 },
      penaltyRules: { where: { isActive: true } },
      payoutSchedule: { orderBy: { monthNumber: 'asc' } },
      _count: { select: { groups: true } },
    },
  });
  if (!product) throw new ApiError(404, 'Product not found');
  return product;
}

export async function update(orgId: string, id: string, data: Partial<{
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
  const product = await prisma.product.findFirst({ where: { id, orgId } });
  if (!product) throw new ApiError(404, 'Product not found');

  const [groupCount, runningGroupCount] = await Promise.all([
    prisma.chitGroup.count({ where: { productId: id } }),
    prisma.chitGroup.count({
      where: { productId: id, status: { in: ['ACTIVE', 'OPEN', 'FROZEN'] } },
    }),
  ]);

  const structureChanged = data.chitValuePaise !== undefined
    || data.memberCount !== undefined
    || data.tenureMonths !== undefined;
  if (structureChanged && groupCount > 0) {
    throw new ApiError(
      400,
      'Chit value, member count and tenure cannot change after groups are created',
    );
  }

  const financialsChanged = data.baseInstallmentPaise !== undefined
    || data.liftedInstallmentPaise !== undefined
    || data.monthlyPayouts !== undefined;
  if (financialsChanged && runningGroupCount > 0) {
    throw new ApiError(400, 'EMIs and payout schedule cannot change while groups are open or active');
  }

  const tenure = data.tenureMonths ?? product.tenureMonths;
  const memberCount = data.memberCount ?? product.memberCount;
  if (memberCount !== tenure) {
    throw new ApiError(400, 'Member count must equal tenure months');
  }

  if (data.monthlyPayouts) {
    if (data.monthlyPayouts.length !== tenure) {
      throw new ApiError(400, `Must provide ${tenure} monthly payouts`);
    }
    const months = new Set(data.monthlyPayouts.map((entry) => entry.monthNumber));
    for (let month = 1; month <= tenure; month++) {
      if (!months.has(month)) throw new ApiError(400, `Missing payout for month ${month}`);
    }
    await prisma.$transaction(async (tx) => {
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
  return prisma.product.update({
    where: { id },
    data: updateData,
    include: { payoutSchedule: { orderBy: { monthNumber: 'asc' } } },
  });
}

export async function toggleActive(orgId: string, id: string) {
  const product = await prisma.product.findFirst({ where: { id, orgId } });
  if (!product) throw new ApiError(404, 'Product not found');
  return prisma.product.update({
    where: { id },
    data: { isActive: !product.isActive },
  });
}
