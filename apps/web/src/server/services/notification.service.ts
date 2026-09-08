import { prisma } from '../prisma';
import { ApiError } from '../http';
import { getMonthLabel } from '@chitfund/shared';
import * as whatsapp from './whatsapp.service';

type NotificationChannel = 'IN_APP' | 'SMS' | 'WHATSAPP' | 'EMAIL' | 'PUSH';

interface SendNotificationParams {
  recipientType: 'customer' | 'staff';
  recipientId: string;
  customerId?: string;
  channel?: NotificationChannel;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Create and queue a notification.
 * IN_APP notifications are immediately marked SENT.
 * WHATSAPP: attempts delivery via WhatsApp Cloud API, falls back to QUEUED.
 * SMS/EMAIL are QUEUED for external provider dispatch.
 */
export async function send(params: SendNotificationParams) {
  const channel = params.channel || 'IN_APP';
  let status = channel === 'IN_APP' ? 'SENT' : 'QUEUED';

  // Attempt WhatsApp delivery if channel is WHATSAPP
  let whatsappMessageId: string | undefined;
  if (channel === 'WHATSAPP' && params.data?.phone) {
    const result = await whatsapp.sendText({
      to: params.data.phone as string,
      text: params.body,
    });
    if (result.success) {
      status = 'DELIVERED';
      whatsappMessageId = result.messageId;
    }
  }

  return prisma.notification.create({
    data: {
      recipientType: params.recipientType,
      recipientId: params.recipientId,
      customerId: params.customerId || (params.recipientType === 'customer' ? params.recipientId : null),
      channel,
      title: params.title,
      body: params.body,
      data: params.data ? JSON.parse(JSON.stringify({ ...params.data, whatsappMessageId })) : undefined,
      status: status as any,
      sentAt: status !== 'QUEUED' ? new Date() : undefined,
    },
  });
}

/**
 * Send the same notification to multiple customers at once.
 */
export async function sendBulk(
  recipients: { customerId: string }[],
  notification: { title: string; body: string; channel?: NotificationChannel; data?: Record<string, unknown> },
) {
  const channel = notification.channel || 'IN_APP';
  const status = channel === 'IN_APP' ? 'SENT' : 'QUEUED';

  return prisma.notification.createMany({
    data: recipients.map((r) => ({
      recipientType: 'customer' as const,
      recipientId: r.customerId,
      customerId: r.customerId,
      channel,
      title: notification.title,
      body: notification.body,
      data: notification.data ? JSON.parse(JSON.stringify(notification.data)) : undefined,
      status,
      sentAt: status === 'SENT' ? new Date() : undefined,
    })),
  });
}

/**
 * Get notifications for a user (paginated, most recent first).
 */
export async function getForUser(recipientId: string, recipientType: 'customer' | 'staff', page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const where = { recipientType, recipientId };

  const [data, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { ...where, readAt: null, status: { in: ['SENT', 'DELIVERED'] } },
    }),
  ]);

  return {
    data,
    unreadCount,
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

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId: string, recipientId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, recipientId },
  });
  if (!notification) throw new ApiError(404, 'Notification not found');
  if (notification.readAt) return notification;

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date(), status: 'READ' },
  });
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(recipientId: string, recipientType: 'customer' | 'staff') {
  return prisma.notification.updateMany({
    where: { recipientId, recipientType, readAt: null },
    data: { readAt: new Date(), status: 'READ' },
  });
}

/**
 * Get unread count only (lightweight for bell badge).
 */
export async function getUnreadCount(recipientId: string, recipientType: 'customer' | 'staff') {
  return prisma.notification.count({
    where: { recipientType, recipientId, readAt: null, status: { in: ['SENT', 'DELIVERED'] } },
  });
}

/**
 * Admin sends a manual notification to a specific customer.
 */
export async function sendManual(params: {
  customerId: string;
  title: string;
  body: string;
  channel?: NotificationChannel;
  orgId: string;
}) {
  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, orgId: params.orgId },
    select: { id: true, phone: true },
  });
  if (!customer) throw new ApiError(404, 'Customer not found');

  return send({
    recipientType: 'customer',
    recipientId: params.customerId,
    customerId: params.customerId,
    channel: params.channel,
    title: params.title,
    body: params.body,
    data: { sentByAdmin: true },
  });
}

/**
 * Remind all unpaid members for a specific group and month.
 * Returns count of notifications sent.
 */
export async function remindUnpaidMembers(groupId: string, monthNumber: number, orgId: string) {
  const group = await prisma.chitGroup.findFirst({
    where: { id: groupId, orgId },
    select: { groupNumber: true, product: { select: { name: true } } },
  });
  if (!group) throw new ApiError(404, 'Group not found');

  const unpaidInstallments = await prisma.installment.findMany({
    where: {
      groupId,
      monthNumber,
      status: { in: ['DUE', 'OVERDUE', 'PARTIALLY_PAID'] },
    },
    include: {
      member: {
        include: { customer: { select: { id: true, name: true, phone: true } } },
      },
    },
  });

  if (unpaidInstallments.length === 0) return { sent: 0 };

  const notifications = unpaidInstallments.map((inst) => ({
    customerId: inst.member.customerId,
    title: 'Payment Due Reminder',
    body: `Dear ${inst.member.customer.name}, your payment of ₹${Number(inst.balancePaise) / 100} for ${group.product.name} (${group.groupNumber}) Month ${monthNumber} is due. Please pay at the earliest.`,
  }));

  const createPromises = notifications.map((n) =>
    send({
      recipientType: 'customer',
      recipientId: n.customerId,
      customerId: n.customerId,
      title: n.title,
      body: n.body,
      data: { groupId, monthNumber, type: 'PAYMENT_REMINDER' },
    }),
  );

  await Promise.allSettled(createPromises);

  return { sent: notifications.length };
}

/**
 * Automated reminder for the payment-due cron (15th-20th of each month).
 * Sends reminders to all members with DUE/OVERDUE installments for the current month.
 */
export async function sendAutomatedPaymentReminders() {
  const now = new Date();
  const day = now.getDate();

  // Only run between 15th and 20th
  if (day < 15 || day > 20) {
    return { sent: 0, skipped: true, reason: 'Not within reminder window (15th-20th)' };
  }

  const unpaidInstallments = await prisma.installment.findMany({
    where: {
      status: { in: ['DUE', 'OVERDUE', 'PARTIALLY_PAID'] },
      dueDate: { lte: now },
    },
    include: {
      member: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          group: {
            select: {
              groupNumber: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (unpaidInstallments.length === 0) return { sent: 0 };

  // De-duplicate per customer (one notification per customer with all pending amounts)
  const customerMap = new Map<string, {
    name: string;
    phone: string;
    items: { group: string; month: number; balance: number }[];
  }>();

  for (const inst of unpaidInstallments) {
    const custId = inst.member.customerId;
    if (!customerMap.has(custId)) {
      customerMap.set(custId, {
        name: inst.member.customer.name,
        phone: inst.member.customer.phone,
        items: [],
      });
    }
    customerMap.get(custId)!.items.push({
      group: `${inst.member.group.product.name} (${inst.member.group.groupNumber})`,
      month: inst.monthNumber,
      balance: Number(inst.balancePaise) / 100,
    });
  }

  let sent = 0;
  const createPromises: Promise<unknown>[] = [];

  for (const [customerId, info] of customerMap) {
    const totalDue = info.items.reduce((sum, i) => sum + i.balance, 0);
    const details = info.items.map((i) => `• ${i.group} Month ${i.month}: ₹${i.balance}`).join('\n');
    const body = `Dear ${info.name}, you have ₹${totalDue} in pending payments:\n${details}\nPlease pay at your earliest convenience.`;

    createPromises.push(
      send({
        recipientType: 'customer',
        recipientId: customerId,
        customerId,
        channel: 'IN_APP',
        title: 'Payment Due Reminder',
        body,
        data: { type: 'AUTO_PAYMENT_REMINDER', totalDue, itemCount: info.items.length },
      }),
    );
    sent++;
  }

  await Promise.allSettled(createPromises);
  return { sent };
}

/**
 * Send notification when a payment is received / marked as paid.
 * Includes: amount, group name, month, receipt number, date, current month cycle, balance.
 */
export async function notifyPaymentReceived(params: {
  customerId: string;
  customerName: string;
  customerPhone: string;
  amountPaise: number;
  groupName: string;
  groupNumber: string;
  monthLabel: string;
  monthNumber: number;
  receiptNumber: string;
  paymentDate: Date;
  currentMonth: number;
  totalSeats: number;
  remainingBalancePaise: number;
  startDate: Date;
  channel?: NotificationChannel;
}) {
  const amt = params.amountPaise / 100;
  const balance = params.remainingBalancePaise / 100;
  const dateStr = params.paymentDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const currentMonthLabel = getMonthLabel(params.startDate, params.currentMonth);

  const body = [
    `✅ Payment Received`,
    `Dear ${params.customerName},`,
    `Amount: ₹${amt.toLocaleString('en-IN')}`,
    `Group: ${params.groupName} (${params.groupNumber})`,
    `Month: ${params.monthLabel}`,
    `Receipt: ${params.receiptNumber}`,
    `Date: ${dateStr}`,
    `Current Cycle: ${currentMonthLabel} (${params.currentMonth}/${params.totalSeats})`,
    balance > 0 ? `Remaining Balance: ₹${balance.toLocaleString('en-IN')}` : `Status: Fully Paid ✅`,
    `Thank you for your payment!`,
  ].join('\n');

  const promises: Promise<unknown>[] = [];

  promises.push(send({
    recipientType: 'customer',
    recipientId: params.customerId,
    customerId: params.customerId,
    channel: 'IN_APP',
    title: '✅ Payment Received',
    body,
    data: {
      type: 'PAYMENT_RECEIVED',
      amountPaise: params.amountPaise,
      groupNumber: params.groupNumber,
      monthNumber: params.monthNumber,
      receiptNumber: params.receiptNumber,
    },
  }));

  if (params.channel === 'WHATSAPP' || whatsapp.isConfigured()) {
    promises.push(
      whatsapp.sendPaymentConfirmation(
        params.customerPhone,
        params.customerName,
        amt,
        `${params.groupName} (${params.groupNumber})`,
        params.monthLabel,
        params.receiptNumber,
      ).then(async (res) => {
        if (!res.success) {
          await whatsapp.sendText({ to: params.customerPhone, text: body });
        }
      }).catch(() => {}),
    );
  }

  await Promise.allSettled(promises);
}

/**
 * Send notification when a member lifts the chit (wins the auction).
 * Includes: payout amount, group, month, deductions.
 */
export async function notifyLiftStatus(params: {
  customerId: string;
  customerName: string;
  customerPhone: string;
  payoutAmountPaise: number;
  groupName: string;
  groupNumber: string;
  monthLabel: string;
  monthNumber: number;
  startDate: Date;
  currentMonth: number;
  totalSeats: number;
  channel?: NotificationChannel;
}) {
  const payout = params.payoutAmountPaise / 100;
  const currentMonthLabel = getMonthLabel(params.startDate, params.currentMonth);

  const body = [
    `🎉 Congratulations! You lifted the chit!`,
    `Dear ${params.customerName},`,
    `Payout Amount: ₹${payout.toLocaleString('en-IN')}`,
    `Group: ${params.groupName} (${params.groupNumber})`,
    `Lift Month: ${params.monthLabel}`,
    `Current Cycle: ${currentMonthLabel} (${params.currentMonth}/${params.totalSeats})`,
    `The payout will be processed to your registered bank account.`,
  ].join('\n');

  const promises: Promise<unknown>[] = [];

  promises.push(send({
    recipientType: 'customer',
    recipientId: params.customerId,
    customerId: params.customerId,
    channel: 'IN_APP',
    title: '🎉 Chit Lifted!',
    body,
    data: {
      type: 'LIFT_NOTIFICATION',
      payoutAmountPaise: params.payoutAmountPaise,
      groupNumber: params.groupNumber,
      monthNumber: params.monthNumber,
    },
  }));

  if (params.channel === 'WHATSAPP' || whatsapp.isConfigured()) {
    promises.push(
      whatsapp.sendLiftNotification(
        params.customerPhone,
        params.customerName,
        payout,
        `${params.groupName} (${params.groupNumber})`,
        params.monthLabel,
      ).catch(() => {}),
    );
  }

  await Promise.allSettled(promises);
}

/**
 * Notify ALL overdue members across all groups (bulk "Notify All" button).
 * Sends both IN_APP and WhatsApp (if configured).
 */
export async function notifyAllOverdue(orgId: string) {
  const now = new Date();

  const unpaidInstallments = await prisma.installment.findMany({
    where: {
      status: { in: ['DUE', 'OVERDUE', 'PARTIALLY_PAID'] },
      dueDate: { lte: now },
      group: { orgId, status: 'ACTIVE' },
    },
    include: {
      member: {
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          group: {
            select: {
              groupNumber: true,
              startDate: true,
              currentMonth: true,
              totalSeats: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (unpaidInstallments.length === 0) return { sent: 0 };

  const customerMap = new Map<string, {
    name: string;
    phone: string;
    items: { group: string; monthLabel: string; balance: number }[];
  }>();

  for (const inst of unpaidInstallments) {
    const custId = inst.member.customerId;
    const startDate = inst.member.group.startDate;
    const monthLabel = getMonthLabel(startDate, inst.monthNumber);

    if (!customerMap.has(custId)) {
      customerMap.set(custId, {
        name: inst.member.customer.name,
        phone: inst.member.customer.phone,
        items: [],
      });
    }
    customerMap.get(custId)!.items.push({
      group: `${inst.member.group.product.name} (${inst.member.group.groupNumber})`,
      monthLabel,
      balance: Number(inst.balancePaise) / 100,
    });
  }

  let sent = 0;
  const promises: Promise<unknown>[] = [];

  for (const [customerId, info] of customerMap) {
    const totalDue = info.items.reduce((sum, i) => sum + i.balance, 0);
    const details = info.items.map((i) => `• ${i.group} ${i.monthLabel}: ₹${i.balance.toLocaleString('en-IN')}`).join('\n');

    const body = [
      `⚠️ Payment Overdue Reminder`,
      `Dear ${info.name},`,
      `Total Due: ₹${totalDue.toLocaleString('en-IN')}`,
      `Details:`,
      details,
      `Please pay at the earliest to avoid penalties.`,
    ].join('\n');

    promises.push(send({
      recipientType: 'customer',
      recipientId: customerId,
      customerId,
      channel: 'IN_APP',
      title: '⚠️ Payment Overdue',
      body,
      data: { type: 'OVERDUE_REMINDER', totalDue, itemCount: info.items.length },
    }));

    if (whatsapp.isConfigured()) {
      promises.push(
        whatsapp.sendText({ to: info.phone, text: body }).catch(() => {}),
      );
    }

    sent++;
  }

  await Promise.allSettled(promises);
  return { sent, whatsappEnabled: whatsapp.isConfigured() };
}

/**
 * Notify a single customer about their overdue payments.
 */
export async function notifyCustomerOverdue(customerId: string, orgId: string) {
  const now = new Date();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, orgId },
    select: { id: true, name: true, phone: true },
  });
  if (!customer) throw new ApiError(404, 'Customer not found');

  const unpaidInstallments = await prisma.installment.findMany({
    where: {
      status: { in: ['DUE', 'OVERDUE', 'PARTIALLY_PAID'] },
      dueDate: { lte: now },
      member: { customerId, group: { orgId, status: 'ACTIVE' } },
    },
    include: {
      member: {
        include: {
          group: {
            select: {
              groupNumber: true,
              startDate: true,
              currentMonth: true,
              totalSeats: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (unpaidInstallments.length === 0) {
    return { sent: 0, message: 'No overdue installments for this customer' };
  }

  const details = unpaidInstallments.map((inst) => {
    const monthLabel = getMonthLabel(inst.member.group.startDate, inst.monthNumber);
    return `• ${inst.member.group.product.name} (${inst.member.group.groupNumber}) ${monthLabel}: ₹${(Number(inst.balancePaise) / 100).toLocaleString('en-IN')}`;
  }).join('\n');

  const totalDue = unpaidInstallments.reduce((sum, inst) => sum + Number(inst.balancePaise), 0) / 100;

  const body = [
    `⚠️ Payment Overdue Reminder`,
    `Dear ${customer.name},`,
    `Total Due: ₹${totalDue.toLocaleString('en-IN')}`,
    `Details:`,
    details,
    `Please pay at the earliest to avoid penalties.`,
  ].join('\n');

  const promises: Promise<unknown>[] = [];

  promises.push(send({
    recipientType: 'customer',
    recipientId: customerId,
    customerId,
    channel: 'IN_APP',
    title: '⚠️ Payment Overdue',
    body,
    data: { type: 'OVERDUE_REMINDER', totalDue, itemCount: unpaidInstallments.length },
  }));

  if (whatsapp.isConfigured()) {
    promises.push(
      whatsapp.sendText({ to: customer.phone, text: body }).catch(() => {}),
    );
  }

  await Promise.allSettled(promises);
  return { sent: 1, whatsappEnabled: whatsapp.isConfigured() };
}

/**
 * Check if WhatsApp integration is enabled.
 */
export function isWhatsAppEnabled(): boolean {
  return whatsapp.isConfigured();
}
