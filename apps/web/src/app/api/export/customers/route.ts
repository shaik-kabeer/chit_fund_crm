import { NextRequest } from 'next/server';
import { handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import { prisma } from '@/server/prisma';
import { toCsv, formatDateIso } from '@/server/csv';

export async function GET(request: NextRequest) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);

    const customers = await prisma.customer.findMany({
      where: {
        orgId: user.orgId,
        deletedAt: null,
        ...(user.branchId ? { branchId: user.branchId } : {}),
      },
      include: {
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = customers.map((c) => [
      c.name,
      c.phone,
      c.email ?? '',
      c.kycStatus,
      c.branch?.name ?? '',
      formatDateIso(c.createdAt),
    ]);

    const csvString = toCsv(
      ['Name', 'Phone', 'Email', 'KYC Status', 'Branch', 'Created At'],
      rows,
    );

    return new Response(csvString, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="customers.csv"',
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
