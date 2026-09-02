import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../http';
import { prisma } from '../__mocks__/prisma';
import { activateApproved, approve, reject } from './membership.service';

vi.mock('../prisma');
vi.mock('./audit.service', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

const memberId = 'member-1';
const groupId = 'group-1';
const orgId = 'org-1';
const approvedById = 'staff-1';
const rejectedById = 'staff-2';

function makeRequestedMember(overrides: Record<string, unknown> = {}) {
  return {
    id: memberId,
    groupId,
    status: 'REQUESTED',
    baseInstallmentPaise: BigInt(100000),
    group: {
      id: groupId,
      status: 'OPEN',
      totalSeats: 20,
      filledSeats: 5,
      startDate: new Date('2026-01-01'),
      product: { tenureMonths: 12 },
    },
    ...overrides,
  };
}

beforeEach(() => {
  prisma.$transaction.mockImplementation(async (callback) =>
    callback(prisma),
  );
});

describe('approve', () => {
  it('sets status APPROVED, assigns ticket, and increments filledSeats', async () => {
    const member = makeRequestedMember();
    prisma.groupMember.findFirst.mockResolvedValue(member as never);
    prisma.groupMember.aggregate.mockResolvedValue({ _max: { ticketNumber: 3 } } as never);
    prisma.chitGroup.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.groupMember.update.mockResolvedValue({
      ...member,
      status: 'APPROVED',
      ticketNumber: 4,
      customer: { id: 'cust-1', name: 'Test User', phone: '9999999999' },
    } as never);

    const result = await approve(memberId, orgId, approvedById);

    expect(result.status).toBe('APPROVED');
    expect(prisma.chitGroup.updateMany).toHaveBeenCalledWith({
      where: {
        id: groupId,
        filledSeats: { lt: 20 },
      },
      data: {
        filledSeats: { increment: 1 },
        version: { increment: 1 },
      },
    });
    expect(prisma.groupMember.update).toHaveBeenCalledWith({
      where: { id: memberId },
      data: expect.objectContaining({
        status: 'APPROVED',
        ticketNumber: 4,
        approvedById,
        approvedAt: expect.any(Date),
      }),
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
  });

  it('throws 404 when membership is not found', async () => {
    prisma.groupMember.findFirst.mockResolvedValue(null);

    await expect(approve(memberId, orgId, approvedById)).rejects.toMatchObject({
      status: 404,
      message: 'Membership not found',
    } satisfies Partial<ApiError>);
  });

  it('throws 400 when member is not in REQUESTED status', async () => {
    prisma.groupMember.findFirst.mockResolvedValue(
      makeRequestedMember({ status: 'APPROVED' }) as never,
    );

    await expect(approve(memberId, orgId, approvedById)).rejects.toMatchObject({
      status: 400,
      message: 'Can only approve REQUESTED memberships',
    } satisfies Partial<ApiError>);
  });
});

describe('activateApproved', () => {
  it('creates installment schedule for all approved members', async () => {
    const approvedMembers = [
      {
        id: 'member-1',
        baseInstallmentPaise: BigInt(100000),
      },
      {
        id: 'member-2',
        baseInstallmentPaise: BigInt(100000),
      },
    ];

    prisma.chitGroup.findFirst.mockResolvedValue({
      id: groupId,
      status: 'OPEN',
      currentMonth: 0,
      startDate: new Date('2026-01-01'),
      product: { tenureMonths: 3 },
    } as never);
    prisma.groupMember.findMany.mockResolvedValue(approvedMembers as never);
    (prisma.installment.groupBy as any).mockResolvedValue([] as never);
    prisma.groupMember.updateMany.mockResolvedValue({ count: 2 } as never);
    prisma.installment.createMany.mockResolvedValue({ count: 6 } as never);
    prisma.chitGroup.update.mockResolvedValue({} as never);

    const result = await activateApproved(groupId, orgId);

    expect(result).toEqual({ activated: 2 });
    expect(prisma.groupMember.updateMany).toHaveBeenCalledWith({
      where: { groupId, status: 'APPROVED' },
      data: { status: 'ACTIVE', joinedAt: expect.any(Date) },
    });
    expect(prisma.installment.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ memberId: 'member-1', monthNumber: 1, groupId }),
        expect.objectContaining({ memberId: 'member-2', monthNumber: 3, groupId }),
      ]),
    });
    const createManyCall = prisma.installment.createMany.mock.calls[0];
    expect((createManyCall?.[0] as { data: unknown[] })?.data).toHaveLength(6);
  });
});

describe('reject', () => {
  it('sets status REJECTED and stores reason in notes', async () => {
    prisma.groupMember.findFirst.mockResolvedValue(
      makeRequestedMember() as never,
    );
    prisma.groupMember.update.mockResolvedValue({
      id: memberId,
      status: 'REJECTED',
      notes: 'Incomplete KYC documents',
    } as never);

    const result = await reject(
      memberId,
      orgId,
      rejectedById,
      'Incomplete KYC documents',
    );

    expect(result.status).toBe('REJECTED');
    expect(prisma.groupMember.update).toHaveBeenCalledWith({
      where: { id: memberId },
      data: {
        status: 'REJECTED',
        notes: 'Incomplete KYC documents',
      },
    });
  });
});
