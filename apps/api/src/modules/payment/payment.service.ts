import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

/** Online methods require payment screenshot proof */
const ONLINE_METHODS = new Set(['UPI', 'NEFT', 'ONLINE_GATEWAY', 'CHEQUE']);
const ALLOWED_METHODS = new Set(['CASH', 'UPI', 'NEFT', 'CHEQUE', 'ONLINE_GATEWAY']);

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async getOrgPaymentInfo(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        paymentUpiId: true,
        paymentPhone: true,
        paymentQrUrl: true,
        phone: true,
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async submitPayment(data: {
    installmentId: string;
    amountPaise: number;
    method: string;
    transactionRef?: string;
    paymentDate: string;
    screenshotUrl?: string;
    customerId?: string;
    collectedById?: string;
  }) {
    const method = (data.method || '').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      throw new BadRequestException(`Invalid payment method. Use: ${[...ALLOWED_METHODS].join(', ')}`);
    }

    // Online → screenshot required; Cash → screenshot not required
    if (ONLINE_METHODS.has(method) && !data.screenshotUrl) {
      throw new BadRequestException(
        'Screenshot of payment is required for online / UPI payments',
      );
    }
    if (method === 'UPI' && !data.transactionRef?.trim()) {
      throw new BadRequestException('UPI transaction / reference ID is required');
    }

    const installment = await this.prisma.installment.findUnique({
      where: { id: data.installmentId },
      include: { member: true },
    });
    if (!installment) throw new NotFoundException('Installment not found');

    if (data.customerId && installment.member.customerId !== data.customerId) {
      throw new BadRequestException('Not your installment');
    }

    if (installment.status === 'PAID' || installment.status === 'WAIVED') {
      throw new BadRequestException('Installment already settled');
    }

    // Block duplicate pending request on same installment
    const pendingExisting = await this.prisma.payment.findFirst({
      where: { installmentId: data.installmentId, status: 'PENDING' },
    });
    if (pendingExisting) {
      throw new ConflictException(
        'A payment request is already pending verification for this month',
      );
    }

    if (BigInt(data.amountPaise) > installment.balancePaise) {
      throw new BadRequestException(
        `Amount exceeds balance. Outstanding: ₹${Number(installment.balancePaise) / 100}`,
      );
    }
    if (data.amountPaise <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    if (data.transactionRef) {
      const existingTxn = await this.prisma.payment.findFirst({
        where: { transactionRef: data.transactionRef, status: { not: 'REJECTED' } },
      });
      if (existingTxn) {
        throw new ConflictException('Transaction reference already used');
      }
    }

    const receiptNumber = await this.generateReceiptNumber(installment.member.groupId);

    const payment = await this.prisma.payment.create({
      data: {
        installmentId: data.installmentId,
        receiptNumber,
        amountPaise: BigInt(data.amountPaise),
        method: method as any,
        transactionRef: data.transactionRef?.trim() || null,
        screenshotUrl: data.screenshotUrl || null,
        paymentDate: new Date(data.paymentDate || new Date()),
        collectedById: data.collectedById,
        status: 'PENDING',
      },
    });

    // Keep installment DUE/OVERDUE until verified — do not mark paid yet
    this.events.emit('payment.submitted', { payment, installment });
    return {
      ...payment,
      message: 'Payment request submitted. Awaiting collector/admin verification.',
    };
  }

  async verifyPayment(paymentId: string, verifiedById: string, orgId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, installment: { group: { orgId } } },
      include: { installment: { include: { member: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') {
      throw new BadRequestException('Payment is not in pending state');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'VERIFIED', verifiedById, verifiedAt: new Date() },
      });

      const newPaid = payment.installment.paidAmountPaise + payment.amountPaise;
      const newBalance = payment.installment.netAmountPaise - newPaid;
      const fullyPaid = newBalance <= 0n;

      await tx.installment.update({
        where: { id: payment.installmentId },
        data: {
          paidAmountPaise: newPaid,
          balancePaise: newBalance < 0n ? 0n : newBalance,
          status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
          paidDate: fullyPaid ? new Date() : undefined,
        },
      });

      await tx.groupMember.update({
        where: { id: payment.installment.memberId },
        data: { totalPaidPaise: { increment: payment.amountPaise } },
      });

      await tx.chitGroup.update({
        where: { id: payment.installment.groupId },
        data: { totalCollectedPaise: { increment: payment.amountPaise } },
      });

      await tx.ledgerEntry.create({
        data: {
          groupId: payment.installment.groupId,
          entryDate: new Date(),
          narration: `Payment received - Receipt #${payment.receiptNumber} (${payment.method})`,
          entryType: 'CREDIT',
          amountPaise: payment.amountPaise,
          accountHead: 'COLLECTION',
          refType: 'payment',
          refId: paymentId,
          memberId: payment.installment.memberId,
          createdBy: verifiedById,
        },
      });
    });

    this.events.emit('payment.verified', { paymentId });
    return { message: 'Payment verified and marked as received' };
  }

  async rejectPayment(paymentId: string, reason: string, rejectedById: string, orgId: string) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException('Write a clear rejection review (minimum 5 characters)');
    }
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, installment: { group: { orgId } } },
      include: { installment: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') {
      throw new BadRequestException('Payment is not in pending state');
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason.trim(),
      },
    });

    this.events.emit('payment.rejected', { paymentId, reason });
    return { message: 'Payment request rejected' };
  }

  async getPendingPayments(orgId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'PENDING', installment: { group: { orgId } } },
        include: {
          installment: {
            include: {
              member: {
                include: {
                  customer: { select: { id: true, name: true, phone: true } },
                  group: {
                    select: {
                      id: true,
                      groupNumber: true,
                      product: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { submittedAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({
        where: { status: 'PENDING', installment: { group: { orgId } } },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async getPaymentHistory(customerId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { installment: { member: { customerId } } },
        include: {
          installment: {
            select: {
              monthNumber: true,
              groupId: true,
              member: { select: { group: { select: { groupNumber: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({
        where: { installment: { member: { customerId } } },
      }),
    ]);

    return {
      data,
      meta: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  private async generateReceiptNumber(groupId: string): Promise<string> {
    const group = await this.prisma.chitGroup.findUnique({
      where: { id: groupId },
      select: { orgId: true },
    });

    const sequence = await this.prisma.receiptSequence.upsert({
      where: { orgId_prefix: { orgId: group!.orgId, prefix: 'RCP' } },
      create: { orgId: group!.orgId, prefix: 'RCP', currentNumber: 1 },
      update: { currentNumber: { increment: 1 } },
    });

    return `RCP-${String(sequence.currentNumber).padStart(8, '0')}`;
  }
}
