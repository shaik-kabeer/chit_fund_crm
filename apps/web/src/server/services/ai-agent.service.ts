import { ApiError } from '../http';
import { prisma } from '../prisma';
import { getMonthLabel, computeEffectiveStatus } from '@chitfund/shared';
import * as customerService from './customer.service';
import * as groupService from './group.service';
import * as paymentService from './payment.service';
import * as membershipService from './membership.service';
import * as analyticsService from './analytics.service';
import * as notificationService from './notification.service';
import * as auditService from './audit.service';

type ActionHandler = (params: Record<string, any>, ctx: ActionContext) => Promise<unknown>;

interface ActionContext {
  orgId: string;
  userId: string;
}

const MUTATION_ACTIONS = new Set([
  'verify_payment',
  'reject_payment',
  'approve_membership',
  'reject_membership',
  'activate_group',
  'update_group_status',
  'send_notification',
  'remind_unpaid',
]);

const ACTION_REGISTRY: Record<string, ActionHandler> = {
  get_dashboard_stats: async (_p, ctx) => {
    return groupService.getDashboardStats(ctx.orgId);
  },

  search_customers: async (params, ctx) => {
    return customerService.findAll(ctx.orgId, 1, 50, params.search);
  },

  get_all_customers: async (_p, ctx) => {
    return customerService.findAll(ctx.orgId, 1, 100);
  },

  get_customer_detail: async (params, ctx) => {
    return customerService.findById(ctx.orgId, params.customerId);
  },

  list_groups: async (params, ctx) => {
    const filters: any = {};
    if (params.status) filters.status = params.status;
    return groupService.findAll(ctx.orgId, filters);
  },

  get_group_detail: async (params, ctx) => {
    return groupService.findById(ctx.orgId, params.groupId);
  },

  get_group_months: async (params, ctx) => {
    return groupService.getMonthOverview(ctx.orgId, params.groupId);
  },

  get_pending_payments: async (_p, ctx) => {
    return paymentService.getPendingPayments(ctx.orgId, 1, 50);
  },

  get_unpaid_members: async (_p, ctx) => {
    const now = new Date();
    const groups = await prisma.chitGroup.findMany({
      where: { orgId: ctx.orgId, status: 'ACTIVE' },
      include: {
        product: { select: { name: true, baseInstallmentPaise: true } },
        members: {
          where: { status: { in: ['ACTIVE', 'PRIZED', 'DEFAULTING'] } },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            installments: {
              where: { status: { notIn: ['PAID', 'WAIVED'] } },
              select: { monthNumber: true, status: true, netAmountPaise: true, paidAmountPaise: true, balancePaise: true, dueDate: true },
              orderBy: { monthNumber: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = groups.map((g) => {
      const startDate = g.startDate;
      return {
        groupNumber: g.groupNumber,
        groupId: g.id,
        product: g.product.name,
        currentMonth: g.currentMonth,
        unpaidMembers: g.members
          .map((m) => {
            const dueInstallments = m.installments.filter((inst) => {
              const eff = computeEffectiveStatus(inst.status, inst.dueDate, now);
              return eff === 'DUE' || eff === 'OVERDUE' || eff === 'PARTIALLY_PAID';
            });
            if (dueInstallments.length === 0) return null;
            return {
              name: m.customer.name,
              phone: m.customer.phone,
              customerId: m.customerId,
              ticketNumber: m.ticketNumber,
              seatLabel: m.seatLabel,
              status: m.status,
              unpaidMonths: dueInstallments.map((inst) => ({
                month: inst.monthNumber,
                monthLabel: getMonthLabel(startDate, inst.monthNumber),
                status: computeEffectiveStatus(inst.status, inst.dueDate, now),
                duePaise: inst.netAmountPaise,
                paidPaise: inst.paidAmountPaise,
                balancePaise: inst.balancePaise,
              })),
              totalPendingPaise: dueInstallments.reduce(
                (sum, inst) => sum + (Number(inst.balancePaise) || Number(inst.netAmountPaise) - Number(inst.paidAmountPaise)),
                0,
              ),
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.totalPendingPaise - a.totalPendingPaise),
      };
    });

    return { groups: result, totalGroups: result.length };
  },

  get_pending_memberships: async (_p, ctx) => {
    return membershipService.getPendingRequests(ctx.orgId);
  },

  get_analytics: async (_p, ctx) => {
    return analyticsService.getAnalytics(ctx.orgId);
  },

  get_audit_logs: async (_p, ctx) => {
    return auditService.getAuditLogs(ctx.orgId, 1, 10);
  },

  verify_payment: async (params, ctx) => {
    return paymentService.verifyPayment(params.paymentId, ctx.userId, ctx.orgId);
  },

  reject_payment: async (params, ctx) => {
    return paymentService.rejectPayment(params.paymentId, params.reason, ctx.userId, ctx.orgId);
  },

  approve_membership: async (params, ctx) => {
    return membershipService.approve(params.memberId, ctx.orgId, ctx.userId);
  },

  reject_membership: async (params, ctx) => {
    return membershipService.reject(params.memberId, ctx.orgId, ctx.userId, params.reason);
  },

  activate_group: async (params, ctx) => {
    return groupService.updateStatus(ctx.orgId, params.groupId, 'ACTIVE', ctx.userId);
  },

  update_group_status: async (params, ctx) => {
    return groupService.updateStatus(ctx.orgId, params.groupId, params.status, ctx.userId);
  },

  send_notification: async (params, ctx) => {
    return notificationService.sendManual({
      customerId: params.customerId,
      title: params.title,
      body: params.body,
      orgId: ctx.orgId,
    });
  },

  remind_unpaid: async (params, ctx) => {
    return notificationService.remindUnpaidMembers(params.groupId, params.monthNumber, ctx.orgId);
  },
};

export function isMutationAction(action: string): boolean {
  return MUTATION_ACTIONS.has(action);
}

export async function executeAction(
  action: string,
  params: Record<string, any>,
  ctx: ActionContext,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const handler = ACTION_REGISTRY[action];
  if (!handler) {
    return { success: false, error: `Unknown action: ${action}` };
  }

  try {
    const data = await handler(params, ctx);
    return { success: true, data };
  } catch (err) {
    if (err instanceof ApiError) {
      return { success: false, error: err.message };
    }
    console.error(`AI agent action ${action} failed:`, err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

export function getSystemPrompt(): string {
  return `You are "Stash AI", a voice assistant for managing a chit fund CRM system. You help the Super Admin perform operations using voice commands.

CRITICAL RULES:
1. ALWAYS respond in the SAME language the user speaks. If they speak Hindi, respond in Hindi. If Urdu, respond in Urdu. If English, respond in English.
2. ALWAYS return valid JSON — nothing else, no markdown, no explanation outside JSON.
3. For read/query operations, set needsConfirmation to false.
4. For write/mutation operations (verify, reject, approve, activate, send notification), set needsConfirmation to true AND include a confirmation question in responseText.
5. When the user confirms (says "haan", "ji", "yes", "theek hai", "karo", "kar do"), set confirmed to true with the SAME action and params from the previous message.
6. When the user cancels (says "nahi", "no", "mat karo", "cancel", "ruko"), return action "none" with a cancellation message.
7. For amounts, always format as ₹X,XXX (Indian format).
8. If you cannot determine which record the user means, ask a clarifying question with action "clarify".
9. When the user asks "pending list" or "who has not paid" or "unpaid customers", ALWAYS use the "get_unpaid_members" action — this shows all customers who have NOT paid, group-wise with their names and amounts.
10. When the user asks "pending payments", use "get_pending_payments" — this shows payments that have been SUBMITTED but are waiting for admin verification.

AVAILABLE ACTIONS:

READ ACTIONS (needsConfirmation: false):
- "get_dashboard_stats" — params: {} — Get overview: active groups, total customers, collections, pending payments, overdue count
- "search_customers" — params: { "search": "name or phone" } — Search customers by name or phone
- "get_all_customers" — params: {} — List all customers
- "get_customer_detail" — params: { "customerId": "id" } — Get full details of a customer
- "list_groups" — params: { "status": "OPEN|ACTIVE|COMPLETED" (optional) } — List all groups, optionally filtered by status
- "get_group_detail" — params: { "groupId": "id" } — Get group details with members
- "get_group_months" — params: { "groupId": "id" } — Get month-wise payment overview of a group
- "get_pending_payments" — params: {} — List all payments SUBMITTED and waiting for admin verification
- "get_unpaid_members" — params: {} — List all members who have NOT PAID their installments yet, group-wise with names, amounts, months
- "get_pending_memberships" — params: {} — List all pending membership requests
- "get_analytics" — params: {} — Get collection trends, payment method breakdown, group performance
- "get_audit_logs" — params: {} — Get recent audit activity logs

WRITE ACTIONS (needsConfirmation: true):
- "verify_payment" — params: { "paymentId": "id" } — Verify/approve a pending payment
- "reject_payment" — params: { "paymentId": "id", "reason": "text" } — Reject a payment with reason
- "approve_membership" — params: { "memberId": "id" } — Approve a pending membership request
- "reject_membership" — params: { "memberId": "id", "reason": "text" } — Reject a membership request
- "activate_group" — params: { "groupId": "id" } — Activate a group (change status to ACTIVE)
- "update_group_status" — params: { "groupId": "id", "status": "OPEN|ACTIVE|COMPLETED|TERMINATED" }
- "send_notification" — params: { "customerId": "id", "title": "text", "body": "text" } — Send notification to a customer
- "remind_unpaid" — params: { "groupId": "id", "monthNumber": number } — Remind unpaid members for a specific month

SPECIAL ACTIONS:
- "clarify" — params: {} — When you need more information from the user
- "none" — params: {} — For general conversation, greetings, or cancellation

RESPONSE FORMAT (STRICT JSON):
{
  "action": "action_name",
  "params": { ... },
  "needsConfirmation": true/false,
  "confirmed": false,
  "responseText": "Human readable response in the user's language"
}

IMPORTANT FOR responseText:
- Keep responseText SHORT for voice (1-2 sentences summary). The detailed data is shown in tables on UI.
- For "get_unpaid_members", say something like "Yeh rahi unpaid members ki list group-wise" and the UI will show full details.
- For "get_pending_payments", say "Yeh hain pending verification wale payments" and the UI will show the table.

EXAMPLES:
User: "Kitne customers hain?"
{"action":"get_dashboard_stats","params":{},"needsConfirmation":false,"confirmed":false,"responseText":"Dashboard stats la raha hoon..."}

User: "Pending list dikhao" or "Kiske payment nahi aaye?"
{"action":"get_unpaid_members","params":{},"needsConfirmation":false,"confirmed":false,"responseText":"Yeh rahi group-wise unpaid members ki list."}

User: "Pending payments dikhao" or "Verify karne wale payments"
{"action":"get_pending_payments","params":{},"needsConfirmation":false,"confirmed":false,"responseText":"Yeh hain verification ke liye pending payments."}

User: "Sab customers dikhao"
{"action":"get_all_customers","params":{},"needsConfirmation":false,"confirmed":false,"responseText":"Yeh rahi sabhi customers ki list."}

User: "Active groups list karo"
{"action":"list_groups","params":{"status":"ACTIVE"},"needsConfirmation":false,"confirmed":false,"responseText":"Active groups ki list la raha hoon."}`;
}

export function formatResultForSpeech(
  action: string,
  data: unknown,
  language: string,
): string {
  if (!data) return '';

  const isHindi = language.startsWith('hi') || language.startsWith('ur');

  try {
    switch (action) {
      case 'get_dashboard_stats': {
        const d = data as any;
        const collected = Number(d.collectedThisMonth || 0) / 100;
        if (isHindi) {
          return `Dashboard: ${d.activeGroups} active groups hain, ${d.totalCustomers} customers hain, is mahine ka collection ₹${collected.toLocaleString('en-IN')} hai, ${d.pendingPayments} payments verify hone baaki hain, ${d.overdueInstallments} overdue installments hain.`;
        }
        return `Dashboard: ${d.activeGroups} active groups, ${d.totalCustomers} customers, this month's collection is ₹${collected.toLocaleString('en-IN')}, ${d.pendingPayments} pending verifications, ${d.overdueInstallments} overdue installments.`;
      }

      case 'search_customers':
      case 'get_all_customers': {
        const d = data as any;
        const items = d.data || [];
        const count = d.meta?.total ?? items.length;
        if (count === 0) return isHindi ? 'Koi customer nahi mila.' : 'No customers found.';
        const names = items.slice(0, 5).map((c: any) => c.name).join(', ');
        const more = count > 5 ? (isHindi ? ` aur ${count - 5} aur` : ` and ${count - 5} more`) : '';
        if (isHindi) return `${count} customers mile: ${names}${more}. Poori list neeche hai.`;
        return `Found ${count} customers: ${names}${more}. Full list is shown below.`;
      }

      case 'get_pending_payments': {
        const d = data as any;
        const items = d.data || [];
        const count = d.meta?.total ?? items.length;
        if (count === 0) return isHindi ? 'Koi payment verify hone ke liye nahi hai.' : 'No payments pending verification.';
        const names = items.slice(0, 3).map((p: any) => {
          const name = p.installment?.member?.customer?.name || 'Unknown';
          const amt = Number(p.amountPaise) / 100;
          return `${name} (₹${amt.toLocaleString('en-IN')})`;
        }).join(', ');
        if (isHindi) return `${count} payments verify hone ke liye pending hain. Jaise ${names}. Poori list neeche hai.`;
        return `${count} payments pending verification. Including ${names}. Full list below.`;
      }

      case 'get_unpaid_members': {
        const d = data as any;
        const groups = d.groups || [];
        const totalUnpaid = groups.reduce((s: number, g: any) => s + g.unpaidMembers.length, 0);
        if (totalUnpaid === 0) return isHindi ? 'Sabka payment aa chuka hai, koi pending nahi hai.' : 'All members have paid, no pending.';
        const summary = groups
          .filter((g: any) => g.unpaidMembers.length > 0)
          .slice(0, 3)
          .map((g: any) => `${g.groupNumber} mein ${g.unpaidMembers.length} unpaid`)
          .join(', ');
        if (isHindi) return `Total ${totalUnpaid} members ka payment pending hai. ${summary}. Poori detail neeche dikhaayi gayi hai.`;
        return `${totalUnpaid} members have unpaid installments. ${summary}. Full details shown below.`;
      }

      case 'get_pending_memberships': {
        const d = data as any[];
        if (!d?.length) return isHindi ? 'Koi pending request nahi hai.' : 'No pending membership requests.';
        const names = d.slice(0, 5).map((m: any) => m.customer?.name || 'Unknown').join(', ');
        if (isHindi) return `${d.length} pending membership requests hain: ${names}. Poori list neeche hai.`;
        return `${d.length} pending membership requests: ${names}. Full list below.`;
      }

      case 'list_groups': {
        const d = data as any[];
        if (!d?.length) return isHindi ? 'Koi group nahi mila.' : 'No groups found.';
        const items = d.slice(0, 5).map((g: any) => `${g.groupNumber} (${g.status})`).join(', ');
        if (isHindi) return `${d.length} groups mile: ${items}. Poori list neeche dikhaayi gayi hai.`;
        return `${d.length} groups found: ${items}. Full list shown below.`;
      }

      default:
        return '';
    }
  } catch {
    return '';
  }
}
