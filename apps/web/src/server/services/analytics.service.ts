import { prisma } from '../prisma';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

/** Build a 6-month trend array, filling missing months with zero. */
export function buildMonthlyTrend(
  rows: { year: number; month: number; amount: number }[],
  monthCount = 6,
): { month: string; amount: number }[] {
  const map = new Map(rows.map((r) => [`${r.year}-${r.month}`, r.amount]));
  const now = new Date();
  const result: { month: string; amount: number }[] = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    result.push({
      month: formatMonthLabel(year, month),
      amount: map.get(`${year}-${month}`) ?? 0,
    });
  }

  return result;
}

async function aggregateVerifiedPaymentsByMonth(orgId: string, monthCount = 6) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);

  const payments = await prisma.payment.findMany({
    where: {
      status: 'VERIFIED',
      verifiedAt: { gte: startDate },
      installment: { group: { orgId } },
    },
    select: { verifiedAt: true, amountPaise: true },
  });

  const monthTotals = new Map<string, { year: number; month: number; amount: number }>();

  for (const payment of payments) {
    if (!payment.verifiedAt) continue;
    const year = payment.verifiedAt.getFullYear();
    const month = payment.verifiedAt.getMonth() + 1;
    const key = `${year}-${month}`;
    const existing = monthTotals.get(key);
    const amount = Number(payment.amountPaise);
    if (existing) {
      existing.amount += amount;
    } else {
      monthTotals.set(key, { year, month, amount });
    }
  }

  return buildMonthlyTrend([...monthTotals.values()], monthCount);
}

export async function getCollectionTrend(orgId: string) {
  return aggregateVerifiedPaymentsByMonth(orgId, 6);
}

export async function getPaymentMethodsBreakdown(orgId: string) {
  const rows = await prisma.payment.groupBy({
    by: ['method'],
    where: {
      status: 'VERIFIED',
      installment: { group: { orgId } },
    },
    _count: { id: true },
  });

  return rows.map((row) => ({
    method: row.method,
    count: row._count.id,
  }));
}

export async function getGroupPerformance(orgId: string) {
  const groups = await prisma.chitGroup.findMany({
    where: { orgId, status: 'ACTIVE' },
    select: {
      groupNumber: true,
      product: { select: { name: true } },
      installments: {
        select: {
          netAmountPaise: true,
          payments: {
            where: { status: 'VERIFIED' },
            select: { amountPaise: true },
          },
        },
      },
    },
    orderBy: { groupNumber: 'asc' },
  });

  return groups.map((group) => {
    let totalCollected = 0;
    let totalExpected = 0;

    for (const inst of group.installments) {
      totalExpected += Number(inst.netAmountPaise);
      for (const payment of inst.payments) {
        totalCollected += Number(payment.amountPaise);
      }
    }

    return {
      groupNumber: group.groupNumber,
      productName: group.product.name,
      totalCollected,
      totalExpected,
    };
  });
}

export async function getAnalytics(orgId: string) {
  const [collectionTrend, paymentMethods, groupPerformance] = await Promise.all([
    getCollectionTrend(orgId),
    getPaymentMethodsBreakdown(orgId),
    getGroupPerformance(orgId),
  ]);

  return { collectionTrend, paymentMethods, groupPerformance };
}
