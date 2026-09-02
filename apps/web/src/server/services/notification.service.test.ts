import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../__mocks__/prisma';

vi.mock('../prisma');

import { send, getForUser, markAsRead, markAllAsRead, getUnreadCount, sendManual, remindUnpaidMembers } from './notification.service';

describe('Notification Service', () => {
  describe('send', () => {
    it('creates IN_APP notification with status SENT', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'notif-1', status: 'SENT' } as never);

      const result = await send({
        recipientType: 'customer',
        recipientId: 'cust-1',
        title: 'Test',
        body: 'Hello',
      });

      expect(result.status).toBe('SENT');
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'IN_APP',
          status: 'SENT',
          sentAt: expect.any(Date),
        }),
      });
    });

    it('creates WHATSAPP notification with status QUEUED', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'notif-2', status: 'QUEUED' } as never);

      await send({
        recipientType: 'customer',
        recipientId: 'cust-1',
        channel: 'WHATSAPP',
        title: 'Reminder',
        body: 'Pay now',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'WHATSAPP',
          status: 'QUEUED',
        }),
      });
    });

    it('creates SMS notification with status QUEUED', async () => {
      prisma.notification.create.mockResolvedValue({ id: 'notif-3', status: 'QUEUED' } as never);

      await send({
        recipientType: 'customer',
        recipientId: 'cust-1',
        channel: 'SMS',
        title: 'Due',
        body: 'Pay now',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ channel: 'SMS', status: 'QUEUED' }),
      });
    });
  });

  describe('getForUser', () => {
    it('returns paginated notifications with unread count', async () => {
      prisma.notification.findMany.mockResolvedValue([
        { id: 'n1', title: 'T1', readAt: null },
        { id: 'n2', title: 'T2', readAt: new Date() },
      ] as never);
      prisma.notification.count
        .mockResolvedValueOnce(10)   // total
        .mockResolvedValueOnce(3);   // unread

      const result = await getForUser('cust-1', 'customer', 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.unreadCount).toBe(3);
      expect(result.meta.total).toBe(10);
    });
  });

  describe('markAsRead', () => {
    it('marks notification as READ', async () => {
      prisma.notification.findFirst.mockResolvedValue({
        id: 'n1', recipientId: 'cust-1', readAt: null,
      } as never);
      prisma.notification.update.mockResolvedValue({
        id: 'n1', status: 'READ', readAt: new Date(),
      } as never);

      const result = await markAsRead('n1', 'cust-1');
      expect(result.status).toBe('READ');
    });

    it('throws 404 for non-existent notification', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(markAsRead('x', 'cust-1')).rejects.toMatchObject({ status: 404 });
    });

    it('returns existing if already read', async () => {
      const existing = { id: 'n1', readAt: new Date(), status: 'READ' };
      prisma.notification.findFirst.mockResolvedValue(existing as never);

      const result = await markAsRead('n1', 'cust-1');
      expect(result).toEqual(existing);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it('updates all unread notifications', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 } as never);

      await markAllAsRead('cust-1', 'customer');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { recipientId: 'cust-1', recipientType: 'customer', readAt: null },
        data: { readAt: expect.any(Date), status: 'READ' },
      });
    });
  });

  describe('getUnreadCount', () => {
    it('returns count of unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(7);

      const result = await getUnreadCount('cust-1', 'customer');
      expect(result).toBe(7);
    });
  });

  describe('sendManual', () => {
    it('sends notification to existing customer', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1', phone: '999' } as never);
      prisma.notification.create.mockResolvedValue({ id: 'n-new' } as never);

      const result = await sendManual({
        customerId: 'cust-1',
        title: 'Hello',
        body: 'Test message',
        orgId: 'org-1',
      });

      expect(result.id).toBe('n-new');
    });

    it('throws 404 when customer not in org', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(sendManual({
        customerId: 'x', title: 'T', body: 'B', orgId: 'org-1',
      })).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('remindUnpaidMembers', () => {
    it('sends reminders to unpaid members', async () => {
      prisma.chitGroup.findFirst.mockResolvedValue({
        groupNumber: 'G-001', product: { name: 'Gold Chit' },
      } as never);
      prisma.installment.findMany.mockResolvedValue([
        {
          balancePaise: BigInt(100000),
          member: { customerId: 'cust-1', customer: { id: 'cust-1', name: 'John', phone: '999' } },
        },
        {
          balancePaise: BigInt(200000),
          member: { customerId: 'cust-2', customer: { id: 'cust-2', name: 'Jane', phone: '888' } },
        },
      ] as never);
      prisma.notification.create.mockResolvedValue({ id: 'n' } as never);

      const result = await remindUnpaidMembers('group-1', 3, 'org-1');

      expect(result.sent).toBe(2);
    });

    it('returns sent:0 when all paid', async () => {
      prisma.chitGroup.findFirst.mockResolvedValue({
        groupNumber: 'G-001', product: { name: 'Gold' },
      } as never);
      prisma.installment.findMany.mockResolvedValue([] as never);

      const result = await remindUnpaidMembers('group-1', 1, 'org-1');
      expect(result.sent).toBe(0);
    });

    it('throws 404 when group not found', async () => {
      prisma.chitGroup.findFirst.mockResolvedValue(null);

      await expect(remindUnpaidMembers('x', 1, 'org-1')).rejects.toMatchObject({ status: 404 });
    });
  });
});
