import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { calculateCommission, calculateDividend } from '@chitfund/shared';

@Injectable()
export class AuctionService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async conductAuction(data: {
    groupId: string;
    monthNumber: number;
    winnerId: string;
    winningBidPaise: number;
    conductedById: string;
    orgId: string;
    notes?: string;
  }) {
    const group = await this.prisma.chitGroup.findFirst({
      where: { id: data.groupId, orgId: data.orgId, status: 'ACTIVE' },
      include: { product: true },
    });
    if (!group) throw new NotFoundException('Group not found or not active');

    if (data.monthNumber !== group.currentMonth + 1) {
      throw new BadRequestException(
        `Expected month ${group.currentMonth + 1}, got ${data.monthNumber}`,
      );
    }

    // Validate winner eligibility
    const winner = await this.prisma.groupMember.findFirst({
      where: { id: data.winnerId, groupId: data.groupId, status: 'ACTIVE' },
    });
    if (!winner) throw new BadRequestException('Winner is not an active member');

    // Check bid bounds
    const maxBid = Number(group.product.chitValuePaise) * Number(group.product.maxBidPercent) / 100;
    const minBid = Number(group.product.chitValuePaise) * Number(group.product.minBidPercent) / 100;
    if (data.winningBidPaise > maxBid) {
      throw new BadRequestException(`Bid exceeds maximum allowed (${maxBid} paise)`);
    }
    if (data.winningBidPaise < minBid) {
      throw new BadRequestException(`Bid below minimum (${minBid} paise)`);
    }

    // Calculate settlement
    const chitValue = group.product.chitValuePaise;
    const commissionPaise = calculateCommission(chitValue, Number(group.product.commissionPercent));
    const bidPaise = BigInt(data.winningBidPaise);
    const prizeAmount = chitValue - bidPaise;
    const activeMembers = await this.prisma.groupMember.count({
      where: { groupId: data.groupId, status: { in: ['ACTIVE', 'PRIZED'] } },
    });
    const dividendPerMember = calculateDividend(bidPaise, commissionPaise, activeMembers);

    // Execute settlement in a single transaction
    const auction = await this.prisma.$transaction(async (tx) => {
      // Check for existing auction (idempotency)
      const existing = await tx.auction.findUnique({
        where: { groupId_monthNumber: { groupId: data.groupId, monthNumber: data.monthNumber } },
      });
      if (existing) throw new ConflictException('Auction already conducted for this month');

      // Create auction record
      const auctionRecord = await tx.auction.create({
        data: {
          groupId: data.groupId,
          monthNumber: data.monthNumber,
          status: 'COMPLETED',
          chitValuePaise: chitValue,
          commissionPaise,
          winnerId: data.winnerId,
          winningBidPaise: bidPaise,
          prizeAmountPaise: prizeAmount,
          dividendPerMemberPaise: dividendPerMember,
          conductedAt: new Date(),
          conductedById: data.conductedById,
          notes: data.notes,
        },
      });

      // Mark winner as PRIZED
      await tx.groupMember.update({
        where: { id: data.winnerId },
        data: {
          status: 'PRIZED',
          prizedAt: new Date(),
          prizedMonth: data.monthNumber,
          totalDividendEarnedPaise: { increment: dividendPerMember },
        },
      });

      // Apply dividend to all unprized active members' NEXT installment
      const unprizedMembers = await tx.groupMember.findMany({
        where: {
          groupId: data.groupId,
          status: 'ACTIVE',
          id: { not: data.winnerId },
        },
      });

      const nextMonth = data.monthNumber + 1;
      if (nextMonth <= group.product.tenureMonths && unprizedMembers.length > 0) {
        for (const member of unprizedMembers) {
          await tx.installment.updateMany({
            where: { memberId: member.id, monthNumber: nextMonth },
            data: {
              dividendPaise: dividendPerMember,
              netAmountPaise: { decrement: Number(dividendPerMember) },
              balancePaise: { decrement: Number(dividendPerMember) },
            },
          });

          // Update member's dividend total
          await tx.groupMember.update({
            where: { id: member.id },
            data: {
              totalDividendEarnedPaise: { increment: dividendPerMember },
              currentInstallmentPaise: member.baseInstallmentPaise - dividendPerMember,
            },
          });
        }
      }

      // Create payout record for winner
      await tx.payout.create({
        data: {
          auctionId: auctionRecord.id,
          memberId: data.winnerId,
          prizeAmountPaise: prizeAmount,
          netPayoutPaise: prizeAmount, // deductions applied later
          status: 'PENDING',
        },
      });

      // Advance group month
      await tx.chitGroup.update({
        where: { id: data.groupId },
        data: { currentMonth: data.monthNumber },
      });

      // Ledger entries
      await tx.ledgerEntry.createMany({
        data: [
          {
            groupId: data.groupId,
            entryDate: new Date(),
            narration: `Month ${data.monthNumber} - Foreman commission`,
            entryType: 'DEBIT',
            amountPaise: commissionPaise,
            accountHead: 'COMMISSION',
            refType: 'auction',
            refId: auctionRecord.id,
            createdBy: data.conductedById,
          },
          {
            groupId: data.groupId,
            entryDate: new Date(),
            narration: `Month ${data.monthNumber} - Dividend distributed to ${unprizedMembers.length} members`,
            entryType: 'DEBIT',
            amountPaise: dividendPerMember * BigInt(unprizedMembers.length),
            accountHead: 'DIVIDEND',
            refType: 'auction',
            refId: auctionRecord.id,
            createdBy: data.conductedById,
          },
          {
            groupId: data.groupId,
            entryDate: new Date(),
            narration: `Month ${data.monthNumber} - Prize to ticket #${winner.ticketNumber}`,
            entryType: 'DEBIT',
            amountPaise: prizeAmount,
            accountHead: 'PAYOUT',
            refType: 'auction',
            refId: auctionRecord.id,
            memberId: data.winnerId,
            createdBy: data.conductedById,
          },
        ],
      });

      return auctionRecord;
    });

    this.events.emit('auction.completed', { auction, dividendPerMember });
    return auction;
  }

  async getGroupAuctions(groupId: string, orgId: string) {
    const group = await this.prisma.chitGroup.findFirst({ where: { id: groupId, orgId } });
    if (!group) throw new NotFoundException('Group not found');

    return this.prisma.auction.findMany({
      where: { groupId },
      include: {
        winner: { include: { customer: { select: { name: true } } } },
        bids: {
          include: { member: { include: { customer: { select: { name: true } } } } },
          orderBy: { bidAmountPaise: 'desc' },
        },
      },
      orderBy: { monthNumber: 'asc' },
    });
  }

  async getPendingPayouts(orgId: string) {
    return this.prisma.payout.findMany({
      where: { status: 'PENDING', auction: { group: { orgId } } },
      include: {
        member: { include: { customer: { select: { name: true, phone: true, bankAccountNo: true, bankIfsc: true, upiId: true } } } },
        auction: { select: { monthNumber: true, group: { select: { groupNumber: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approvePayout(payoutId: string, approvedById: string, orgId: string) {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, auction: { group: { orgId } } },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'PENDING') throw new BadRequestException('Payout not pending');

    return this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'APPROVED', approvedById, approvedAt: new Date() },
    });
  }

  async completePayout(payoutId: string, transactionRef: string, orgId: string) {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, auction: { group: { orgId } } },
      include: { auction: true, member: { select: { groupId: true } } },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== 'APPROVED') throw new BadRequestException('Payout not approved');

    const groupId = payout.auction?.groupId || payout.member.groupId;

    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id: payoutId },
        data: { status: 'COMPLETED', transactionRef, paidAt: new Date() },
      });

      await tx.chitGroup.update({
        where: { id: groupId },
        data: { totalDisbursedPaise: { increment: payout.netPayoutPaise } },
      });
    });

    return { message: 'Payout completed' };
  }
}
