'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { useState } from 'react';

function getMonthLabel(startDate: string | Date, monthNumber: number): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(startDate);
  const idx = (d.getMonth() + monthNumber - 1) % 12;
  const year = d.getFullYear() + Math.floor((d.getMonth() + monthNumber - 1) / 12);
  return `M${monthNumber}-${MONTHS[idx]} ${year}`;
}

function computeEffectiveStatus(dbStatus: string, dueDate: string | Date): string {
  if (dbStatus === 'PAID' || dbStatus === 'WAIVED' || dbStatus === 'PARTIALLY_PAID') return dbStatus;
  const today = new Date();
  const due = new Date(dueDate);
  const todayMonth = today.getFullYear() * 12 + today.getMonth();
  const dueMonth = due.getFullYear() * 12 + due.getMonth();
  if (dueMonth > todayMonth) return 'UPCOMING';
  if (dueMonth === todayMonth) return 'DUE';
  return 'OVERDUE';
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [kycReason, setKycReason] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyForm, setNotifyForm] = useState({ title: '', body: '', channel: 'IN_APP' });
  const [markPaidTarget, setMarkPaidTarget] = useState<{
    installmentId: string; balancePaise: number; name: string; monthLabel: string;
  } | null>(null);
  const [markPaidForm, setMarkPaidForm] = useState({ amount: '', method: 'CASH', date: new Date().toISOString().slice(0, 10), notes: '' });

  const { data: customer, isLoading } = useQuery({
    queryKey: ['admin-customer', id],
    queryFn: () => api.get<any>(`/customers/${id}`),
    enabled: !!id,
  });

  const updateCustomer = useMutation({
    mutationFn: () => api.patch(`/customers/${id}`, editForm),
    onSuccess: () => {
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ['admin-customer', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    },
  });

  const reviewKyc = useMutation({
    mutationFn: (status: 'VERIFIED' | 'REJECTED') =>
      api.patch(`/customers/${id}/kyc`, { status, reason: kycReason.trim() || undefined }),
    onSuccess: () => {
      setKycReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-customer', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    },
  });

  const resetPassword = useMutation({
    mutationFn: () => api.post<{ temporaryPassword: string }>(
      `/customers/${id}/reset-password`,
      {},
    ),
    onSuccess: (result) => setTemporaryPassword(result.temporaryPassword),
  });

  const sendNotification = useMutation({
    mutationFn: () => api.post('/notifications/send', {
      customerId: id,
      title: notifyForm.title,
      body: notifyForm.body,
      channel: notifyForm.channel,
    }),
    onSuccess: () => {
      setNotifyOpen(false);
      setNotifyForm({ title: '', body: '', channel: 'IN_APP' });
      alert('Notification sent!');
    },
  });

  const sendOverdueReminder = useMutation({
    mutationFn: () => api.post('/notifications/notify-customer-overdue', { customerId: id }),
    onSuccess: (data: any) => {
      alert(data.message || 'Overdue reminder sent!');
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (payload: { installmentId: string; amountPaise: number; method: string; paymentDate: string; notes?: string }) =>
      api.post('/payments/mark-paid', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer', id] });
      setMarkPaidTarget(null);
      setMarkPaidForm({ amount: '', method: 'CASH', date: new Date().toISOString().slice(0, 10), notes: '' });
    },
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!customer) return <div className="text-center py-12 text-gray-500">Customer not found</div>;

  const memberships = customer.memberships || [];
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_ADMIN';

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/admin/customers" className="hover:text-blue-600 transition">← Customers</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">{customer.name}</span>
      </div>

      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            <p className="text-gray-500 mt-1">{customer.phone} · {customer.email || 'No email'}</p>
          </div>
          <div className="flex gap-2 items-center">
            {canManage && (
              <>
                <button
                  onClick={() => sendOverdueReminder.mutate()}
                  disabled={sendOverdueReminder.isPending}
                  className="px-3 py-1 bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg hover:bg-red-100 disabled:opacity-50"
                >
                  {sendOverdueReminder.isPending ? 'Sending...' : '⚠️ Send Overdue Reminder'}
                </button>
                <button
                  onClick={() => setNotifyOpen(!notifyOpen)}
                  className="px-3 py-1 bg-amber-50 border border-amber-300 text-amber-700 text-sm rounded-lg hover:bg-amber-100"
                >
                  Notify
                </button>
                <button
                  onClick={() => resetPassword.mutate()}
                  disabled={resetPassword.isPending}
                  className="px-3 py-1 border text-sm rounded-lg disabled:opacity-50"
                >
                  {resetPassword.isPending ? 'Resetting...' : 'Reset Password'}
                </button>
                <button onClick={() => {
                  setEditForm({
                    name: customer.name || '', phone: customer.phone || '', email: customer.email || '',
                    fatherName: customer.fatherName || '', address: customer.address || '',
                    city: customer.city || '', state: customer.state || '', pincode: customer.pincode || '',
                    bankName: customer.bankName || '', bankAccountNo: customer.bankAccountNo || '',
                    bankIfsc: customer.bankIfsc || '', bankBranch: customer.bankBranch || '',
                    upiId: customer.upiId || '', isActive: customer.isActive,
                  });
                  setEditing(true);
                }} className="px-3 py-1 border text-sm rounded-lg">Edit Customer</button>
              </>
            )}
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              customer.kycStatus === 'VERIFIED' ? 'bg-green-100 text-green-700'
                : customer.kycStatus === 'PENDING' || customer.kycStatus === 'SUBMITTED' ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700'
            }`}>{customer.kycStatus}</span>
          </div>
        </div>

        {temporaryPassword && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            New temporary password: <strong className="select-all">{temporaryPassword}</strong>
            <p className="mt-1 text-xs">Copy it now and share it securely. Existing sessions were signed out.</p>
          </div>
        )}
        {resetPassword.isError && (
          <p className="mt-3 text-sm text-red-600">{(resetPassword.error as Error).message}</p>
        )}

        {notifyOpen && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-amber-900">Send Notification to {customer.name}</h3>
            {sendNotification.isError && (
              <p className="text-xs text-red-600">{(sendNotification.error as Error).message}</p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Title</label>
                <input
                  value={notifyForm.title}
                  onChange={(e) => setNotifyForm({ ...notifyForm, title: e.target.value })}
                  placeholder="Payment Reminder"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Channel</label>
                <select
                  value={notifyForm.channel}
                  onChange={(e) => setNotifyForm({ ...notifyForm, channel: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="IN_APP">In-App</option>
                  <option value="WHATSAPP">WhatsApp (coming soon)</option>
                  <option value="SMS">SMS (coming soon)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Message</label>
              <textarea
                value={notifyForm.body}
                onChange={(e) => setNotifyForm({ ...notifyForm, body: e.target.value })}
                placeholder="Dear member, your payment of ₹X for group Y is due..."
                rows={3}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => sendNotification.mutate()}
                disabled={sendNotification.isPending || !notifyForm.title.trim() || !notifyForm.body.trim()}
                className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50"
              >
                {sendNotification.isPending ? 'Sending...' : 'Send Notification'}
              </button>
              <button onClick={() => setNotifyOpen(false)} className="px-4 py-2 border text-sm rounded-lg">Cancel</button>
            </div>
          </div>
        )}

        {editing && (
          <form onSubmit={(event) => { event.preventDefault(); updateCustomer.mutate(); }}
            className="mt-5 pt-5 border-t space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                ['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'],
                ['fatherName', 'Father / guardian'], ['address', 'Address'], ['city', 'City'],
                ['state', 'State'], ['pincode', 'Pincode'], ['bankName', 'Bank'],
                ['bankAccountNo', 'Bank account'], ['bankIfsc', 'IFSC'], ['upiId', 'UPI ID'],
              ].map(([key, label]) => (
                <label key={key} className="text-xs text-gray-600">{label}
                  <input value={editForm[key] || ''}
                    onChange={(event) => setEditForm({ ...editForm, [key]: event.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" />
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editForm.isActive !== false}
                onChange={(event) => setEditForm({ ...editForm, isActive: event.target.checked })} />
              Account active
            </label>
            {(updateCustomer.isError) && <p className="text-sm text-red-600">{(updateCustomer.error as any)?.message}</p>}
            <div className="flex gap-2">
              <button disabled={updateCustomer.isPending} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">
                {updateCustomer.isPending ? 'Saving...' : 'Save Customer'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 border text-sm rounded-lg">Cancel</button>
            </div>
          </form>
        )}

        <div className="grid sm:grid-cols-3 gap-4 mt-6 pt-4 border-t text-sm">
          <div><span className="text-gray-500">Address</span><p className="font-medium">{customer.address || 'Not provided'}</p></div>
          <div><span className="text-gray-500">City</span><p className="font-medium">{customer.city || '—'}</p></div>
          <div><span className="text-gray-500">Groups</span><p className="font-medium">{memberships.length}</p></div>
        </div>

        {customer.bankAccountNo && (
          <div className="grid sm:grid-cols-3 gap-4 mt-4 pt-4 border-t text-sm">
            <div><span className="text-gray-500">Bank Account</span><p className="font-medium">{customer.bankAccountNo}</p></div>
            <div><span className="text-gray-500">IFSC</span><p className="font-medium">{customer.bankIfsc || '—'}</p></div>
            <div><span className="text-gray-500">Bank Name</span><p className="font-medium">{customer.bankName || '—'}</p></div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold text-gray-800">KYC Review</h2>
        <div className="grid sm:grid-cols-4 gap-4 mt-4 text-sm">
          <div><span className="text-gray-500">PAN</span><p className="font-medium">{customer.pan || 'Not provided'}</p></div>
          <div><span className="text-gray-500">Aadhaar</span><p className="font-medium">{customer.aadhaarLast4 ? `•••• ${customer.aadhaarLast4}` : 'Not provided'}</p></div>
          <div><span className="text-gray-500">Date of birth</span><p className="font-medium">{customer.dateOfBirth ? formatDate(customer.dateOfBirth) : 'Not provided'}</p></div>
          <div><span className="text-gray-500">Submitted</span><p className="font-medium">{customer.kycSubmittedAt ? formatDate(customer.kycSubmittedAt) : '—'}</p></div>
        </div>
        {customer.kycRejectionReason && (
          <p className="mt-4 p-3 bg-red-50 text-sm text-red-700 rounded-lg">
            Previous rejection: {customer.kycRejectionReason}
          </p>
        )}
        {canManage && customer.kycStatus === 'SUBMITTED' && (
          <div className="mt-4 space-y-3">
            <textarea value={kycReason} onChange={(event) => setKycReason(event.target.value)}
              placeholder="Reason required when rejecting"
              className="w-full px-3 py-2 border rounded-lg text-sm" />
            {reviewKyc.isError && <p className="text-sm text-red-600">{(reviewKyc.error as any)?.message}</p>}
            <div className="flex gap-2">
              <button onClick={() => reviewKyc.mutate('VERIFIED')} disabled={reviewKyc.isPending}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg">Approve KYC</button>
              <button onClick={() => reviewKyc.mutate('REJECTED')} disabled={reviewKyc.isPending || kycReason.trim().length < 5}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg disabled:opacity-50">Reject KYC</button>
            </div>
          </div>
        )}
      </div>

      {/* Mark as Paid form */}
      {markPaidTarget && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-900">
              Mark as Paid — {markPaidTarget.name} · {markPaidTarget.monthLabel}
            </h3>
            <button onClick={() => setMarkPaidTarget(null)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
          </div>
          <p className="text-xs text-gray-500">
            Outstanding: {formatCurrency(markPaidTarget.balancePaise)}
          </p>
          {markPaidMutation.isError && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {(markPaidMutation.error as any)?.message || 'Failed'}
            </div>
          )}
          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount (₹)</label>
              <input type="number" step="0.01" min="1"
                value={markPaidForm.amount}
                onChange={(e) => setMarkPaidForm({ ...markPaidForm, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Method</label>
              <select value={markPaidForm.method}
                onChange={(e) => setMarkPaidForm({ ...markPaidForm, method: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="NEFT">NEFT</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={markPaidForm.date}
                onChange={(e) => setMarkPaidForm({ ...markPaidForm, date: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input value={markPaidForm.notes}
                onChange={(e) => setMarkPaidForm({ ...markPaidForm, notes: e.target.value })}
                placeholder="Optional"
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const amtRupees = parseFloat(markPaidForm.amount);
                if (!amtRupees || amtRupees <= 0) return;
                markPaidMutation.mutate({
                  installmentId: markPaidTarget.installmentId,
                  amountPaise: Math.round(amtRupees * 100),
                  method: markPaidForm.method,
                  paymentDate: markPaidForm.date,
                  notes: markPaidForm.notes || undefined,
                });
              }}
              disabled={markPaidMutation.isPending || !markPaidForm.amount}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50 hover:bg-blue-700"
            >
              {markPaidMutation.isPending ? 'Saving...' : 'Record Payment'}
            </button>
            <button onClick={() => setMarkPaidTarget(null)} className="px-4 py-2 border text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Group Memberships ({memberships.length})
        </h2>

        {memberships.length === 0 ? (
          <div className="bg-white rounded-xl border p-6">
            <p className="text-gray-500 text-sm">No memberships.</p>
          </div>
        ) : (
          memberships.map((m: any) => {
            const isOpen = openGroup === m.id;
            const product = m.group?.product;
            const groupStartDate = m.group?.startDate;
            const installments = m.installments || [];
            const paid = installments.filter((i: any) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID');
            const pending = installments.filter((i: any) => {
              const eff = i.dueDate ? computeEffectiveStatus(i.status, i.dueDate) : i.status;
              return ['DUE', 'OVERDUE'].includes(eff);
            });

            return (
              <div key={m.id} className="bg-white rounded-xl border overflow-hidden">
                <button
                  onClick={() => setOpenGroup(isOpen ? null : m.id)}
                  className="w-full text-left p-5 hover:bg-gray-50 transition"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {product?.name} — {m.group?.groupNumber}
                        {m.seatLabel ? (
                          <span className="ml-2 text-sm font-normal text-blue-600">· {m.seatLabel}</span>
                        ) : null}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {m.ticketNumber ? `Ticket #${m.ticketNumber}` : 'Pending ticket'}
                        {m.joinedAt && ` · Joined ${formatDate(m.joinedAt)}`}
                        {groupStartDate && ` · Started ${formatDate(groupStartDate)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        m.status === 'PRIZED' ? 'bg-green-100 text-green-700'
                          : m.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>{m.status === 'PRIZED' ? 'Lifted' : m.status}</span>
                      <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
                    <div>
                      <span className="text-gray-500">Current EMI</span>
                      <p className="font-medium">{formatCurrency(m.currentEmiPaise)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">EMI before lift</span>
                      <p className="font-medium">{formatCurrency(m.emiBeforeLiftPaise)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">EMI after lift</span>
                      <p className="font-medium">{formatCurrency(m.emiAfterLiftPaise)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Lift status</span>
                      <p className="font-medium">
                        {m.liftInfo
                          ? `${groupStartDate ? getMonthLabel(groupStartDate, m.liftInfo.prizedMonth) : `Month ${m.liftInfo.prizedMonth}`}${m.liftInfo.prizedAt ? ` (${formatDate(m.liftInfo.prizedAt)})` : ''}`
                          : 'Not lifted'}
                      </p>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t px-5 pb-5 space-y-5">
                    {m.liftInfo && (
                      <div className="mt-4 p-4 bg-green-50 rounded-lg text-sm text-green-800">
                        <p>
                          Lifted in <strong>{groupStartDate ? getMonthLabel(groupStartDate, m.liftInfo.prizedMonth) : `month ${m.liftInfo.prizedMonth}`}</strong>
                          {m.liftInfo.prizedAt && <> on {formatDate(m.liftInfo.prizedAt)}</>}.
                          {' '}EMI changed from {formatCurrency(m.emiBeforeLiftPaise)} → {formatCurrency(m.emiAfterLiftPaise)}.
                          {m.liftInfo.schedulePayoutPaise && (
                            <> Payout: <strong>{formatCurrency(m.liftInfo.schedulePayoutPaise)}</strong>.</>
                          )}
                        </p>
                        <Link href={`/admin/groups/${m.groupId}`} className="text-blue-600 hover:underline text-xs mt-1 inline-block">
                          Open group →
                        </Link>
                      </div>
                    )}

                    {product?.payoutSchedule?.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Payout if lifted in each month</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                          {product.payoutSchedule.map((s: any) => (
                            <div key={s.monthNumber}
                              className={`rounded px-2 py-1.5 ${
                                m.prizedMonth === s.monthNumber ? 'bg-green-100 border border-green-300' : 'bg-gray-50'
                              }`}>
                              <span className="text-gray-500">{groupStartDate ? getMonthLabel(groupStartDate, s.monthNumber) : `M${s.monthNumber}`}</span>
                              <p className="font-medium">{formatCurrency(s.payoutAmountPaise)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Payment history ({paid.length} paid · {pending.length} due/overdue)
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-gray-500">
                              <th className="pb-2 font-medium">Month</th>
                              <th className="pb-2 font-medium">Due</th>
                              <th className="pb-2 font-medium">Paid</th>
                              <th className="pb-2 font-medium">Paid On</th>
                              <th className="pb-2 font-medium">Status</th>
                              {canManage && <th className="pb-2 font-medium text-right">Action</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {installments.map((inst: any) => {
                              const verified = (inst.payments || []).find((p: any) => p.status === 'VERIFIED');
                              const effectiveStatus = inst.dueDate ? computeEffectiveStatus(inst.status, inst.dueDate) : inst.status;
                              const label = groupStartDate ? getMonthLabel(groupStartDate, inst.monthNumber) : `Month ${inst.monthNumber}`;
                              return (
                                <tr key={inst.id} className="border-b last:border-0">
                                  <td className="py-2">
                                    <span className="font-medium">{label}</span>
                                    <span className="text-gray-400 ml-1 text-xs">(M{inst.monthNumber})</span>
                                  </td>
                                  <td className="py-2">{formatCurrency(inst.netAmountPaise)}</td>
                                  <td className="py-2">{formatCurrency(inst.paidAmountPaise)}</td>
                                  <td className="py-2 text-gray-500">
                                    {verified?.paymentDate
                                      ? formatDate(verified.paymentDate)
                                      : verified?.verifiedAt
                                        ? formatDate(verified.verifiedAt)
                                        : '—'}
                                  </td>
                                  <td className="py-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      effectiveStatus === 'PAID' ? 'bg-green-100 text-green-700'
                                        : effectiveStatus === 'OVERDUE' ? 'bg-red-100 text-red-700'
                                        : effectiveStatus === 'DUE' ? 'bg-amber-100 text-amber-700'
                                        : effectiveStatus === 'PARTIALLY_PAID' ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>{effectiveStatus}</span>
                                  </td>
                                  {canManage && (
                                    <td className="py-2 text-right">
                                      {effectiveStatus !== 'PAID' && effectiveStatus !== 'WAIVED' && effectiveStatus !== 'UPCOMING' && (
                                        <button
                                          onClick={() => {
                                            setMarkPaidTarget({
                                              installmentId: inst.id,
                                              balancePaise: Number(inst.balancePaise || inst.netAmountPaise),
                                              name: customer.name,
                                              monthLabel: label,
                                            });
                                            setMarkPaidForm({
                                              amount: String(Number(inst.balancePaise || inst.netAmountPaise) / 100),
                                              method: 'CASH',
                                              date: new Date().toISOString().slice(0, 10),
                                              notes: '',
                                            });
                                          }}
                                          className="px-2 py-1 border border-blue-300 text-blue-700 text-xs rounded hover:bg-blue-50"
                                        >
                                          Mark Paid
                                        </button>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                            {installments.length === 0 && (
                              <tr><td colSpan={canManage ? 6 : 5} className="py-3 text-gray-500">No installment schedule yet.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
