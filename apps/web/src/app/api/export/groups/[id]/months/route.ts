import { NextRequest } from 'next/server';
import { ApiError, handleRouteError } from '@/server/http';
import { requireStaff } from '@/server/auth';
import { prisma } from '@/server/prisma';
import { toCsv, formatDateIso, formatAmountRupee } from '@/server/csv';

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireStaff(request, ['SUPER_ADMIN', 'BRANCH_ADMIN']);

    const group = await prisma.chitGroup.findFirst({
      where: {
        id: params.id,
        orgId: user.orgId,
        ...(user.branchId ? { branchId: user.branchId } : {}),
      },
    });
    if (!group) throw new ApiError(404, 'Group not found');

    const installments = await prisma.installment.findMany({
      where: { groupId: params.id },
      include: {
        member: {
          include: {
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: [{ monthNumber: 'asc' }, { member: { ticketNumber: 'asc' } }],
    });

    const rows = installments.map((inst) => [
      String(inst.monthNumber),
      inst.member.customer.name,
      inst.member.ticketNumber != null ? String(inst.member.ticketNumber) : '',
      formatDateIso(inst.dueDate),
      formatAmountRupee(inst.netAmountPaise),
      inst.status,
      formatDateIso(inst.paidDate),
    ]);

    const csvString = toCsv(
      ['Month', 'Customer', 'Ticket', 'Due Date', 'Amount', 'Status', 'Paid Date'],
      rows,
    );

    const filename = `group-${group.groupNumber}-months.csv`.replace(/[^a-zA-Z0-9._-]/g, '_');

    return new Response(csvString, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
