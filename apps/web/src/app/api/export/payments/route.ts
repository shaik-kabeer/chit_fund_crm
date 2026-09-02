import { NextRequest } from 'next/server';
import type { PaymentStatus } from '@prisma/client';
import { handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import { prisma } from '@/server/prisma';
import { toCsv, formatDateIso, formatAmountRupee } from '@/server/csv';

export async function GET(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN', 'COLLECTOR']);
    const { searchParams } = request.nextUrl;

    const groupId = searchParams.get('groupId') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const fromDate = searchParams.get('fromDate') ?? undefined;
    const toDate = searchParams.get('toDate') ?? undefined;

    const payments = await prisma.payment.findMany({
      where: {
        ...(status ? { status: status as PaymentStatus } : {}),
        ...(fromDate || toDate
          ? {
              paymentDate: {
                ...(fromDate ? { gte: new Date(fromDate) } : {}),
                ...(toDate ? { lte: new Date(toDate) } : {}),
              },
            }
          : {}),
        installment: {
          group: {
            orgId: user.orgId,
            ...(groupId ? { id: groupId } : {}),
            ...(user.branchId ? { branchId: user.branchId } : {}),
          },
        },
      },
      include: {
        verifiedBy: { select: { name: true } },
        installment: {
          include: {
            member: {
              include: {
                customer: { select: { name: true } },
                group: {
                  select: {
                    groupNumber: true,
                    product: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    });

    const rows = payments.map((p) => {
      const member = p.installment.member;
      const group = member.group;
      const groupLabel = group.product?.name
        ? `${group.product.name} — ${group.groupNumber}`
        : group.groupNumber;

      return [
        member.customer.name,
        groupLabel,
        String(p.installment.monthNumber),
        formatAmountRupee(p.amountPaise),
        p.method,
        p.status,
        formatDateIso(p.paymentDate),
        p.verifiedBy?.name ?? '',
        p.transactionRef ?? '',
      ];
    });

    const csvString = toCsv(
      ['Customer', 'Group', 'Month', 'Amount', 'Method', 'Status', 'Date', 'Verified By', 'Transaction Ref'],
      rows,
    );

    return new Response(csvString, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="payments.csv"',
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
