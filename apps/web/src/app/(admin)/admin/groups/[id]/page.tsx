'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useState } from 'react';
import Link from 'next/link';

const MEMBER_LABEL: Record<string, string> = {
  APPROVED: 'Approved (not started)',
  ACTIVE: 'Active',
  PRIZED: 'Lifted',
  DEFAULTING: 'Defaulting',
  COMPLETED: 'Completed',
};

const MEMBER_BADGE: Record<string, string> = {
  APPROVED: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-blue-100 text-blue-700',
  PRIZED: 'bg-green-100 text-green-700',
  DEFAULTING: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-gray-100 text-gray-600',
};

function AddSeatForm({ groupId }: { groupId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [seatLabel, setSeatLabel] = useState('');
  const [error, setError] = useState('');

  const { data: customers } = useQuery({
    queryKey: ['admin-customers-pick'],
    queryFn: () => api.get<any>('/customers?page=1&limit=100'),
    enabled: open,
  });

  const addSeat = useMutation({
    mutationFn: () =>
      api.post('/memberships/admin-add-seat', {
        groupId,
        customerId,
        seatLabel: seatLabel.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-detail', groupId] });
      queryClient.invalidateQueries({ queryKey: ['group-months', groupId] });
      setOpen(false);
      setCustomerId('');
      setSeatLabel('');
      setError('');
    },
    onError: (err: any) => setError(err.message || 'Failed'),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
      >
        + Add seat for customer
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      <h3 className="font-medium text-gray-800">Add another seat (multi-seat)</h3>
      {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select customer</option>
            {(customers?.data || []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Seat name</label>
          <input
            value={seatLabel}
            onChange={(e) => setSeatLabel(e.target.value)}
            placeholder="e.g. Family, Shop-1"
            className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => addSeat.mutate()}
          disabled={!customerId || addSeat.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50"
        >
          {addSeat.isPending ? 'Adding...' : 'Add Seat'}
        </button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 border text-sm rounded-lg">Cancel</button>
      </div>
    </div>
  );
}

export default function GroupDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const [tab, setTab] = useState<'members' | 'months' | 'requests'>('months');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [confirmLift, setConfirmLift] = useState<{ memberId: string; month: number } | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<{
    installmentId: string; memberId: string; balancePaise: number; name: string;
  } | null>(null);
  const [markPaidForm, setMarkPaidForm] = useState({ amount: '', method: 'CASH', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ groupNumber: '', agreementNo: '', startDate: '' });

  const { data: group, isLoading } = useQuery({
    queryKey: ['group-detail', id],
    queryFn: () => api.get<any>(`/groups/${id}`),
    enabled: !!id,
  });

  const { data: monthData } = useQuery({
    queryKey: ['group-months', id],
    queryFn: () => api.get<any>(`/groups/${id}/months`),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: (memberId: string) => api.patch(`/memberships/${memberId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['group-months', id] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ memberId, reason }: { memberId: string; reason?: string }) =>
      api.patch(`/memberships/${memberId}/reject`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-detail', id] }),
  });

  const activateMutation = useMutation({
    mutationFn: () => api.post(`/memberships/activate/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['group-months', id] });
    },
  });

  const liftMutation = useMutation({
    mutationFn: ({ memberId, monthNumber }: { memberId: string; monthNumber: number }) =>
      api.patch(`/memberships/${memberId}/lift`, { monthNumber }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['group-months', id] });
      setConfirmLift(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/groups/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['group-detail', id] }),
  });

  const editGroupMutation = useMutation({
    mutationFn: () => api.patch(`/groups/${id}`, groupForm),
    onSuccess: () => {
      setEditingGroup(false);
      queryClient.invalidateQueries({ queryKey: ['group-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-groups'] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (payload: { installmentId: string; amountPaise: number; method: string; paymentDate: string; notes?: string }) =>
      api.post('/payments/mark-paid', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['group-months', id] });
      setMarkPaidTarget(null);
      setMarkPaidForm({ amount: '', method: 'CASH', date: new Date().toISOString().slice(0, 10), notes: '' });
    },
  });

  const remindUnpaidMutation = useMutation({
    mutationFn: (monthNumber: number) =>
      api.post('/notifications/remind-unpaid', { groupId: id, monthNumber }),
    onSuccess: () => {
      alert('Reminders sent to unpaid members!');
    },
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!group) return <div className="text-center py-12 text-gray-500">Group not found</div>;

  const members = group.members || [];
  const requested = members.filter((m: any) => m.status === 'REQUESTED');
  const approved = members.filter((m: any) => m.status === 'APPROVED');
  const active = members.filter((m: any) => m.status === 'ACTIVE');
  const prized = members.filter((m: any) => m.status === 'PRIZED');
  // Everyone holding a seat, including those approved but not yet activated
  const seated = members.filter((m: any) =>
    ['APPROVED', 'ACTIVE', 'PRIZED', 'DEFAULTING', 'COMPLETED'].includes(m.status),
  );
  const tenure = group.product?.tenureMonths || 0;
  const months = monthData?.months || [];
  const activeMonthView = selectedMonth ?? (group.currentMonth > 0 ? group.currentMonth : 1);
  const monthView = months.find((m: any) => m.monthNumber === activeMonthView);
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_ADMIN';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {group.product?.name} — {group.groupNumber}
            </h1>
            <p className="text-gray-500 mt-1">
              Month {group.currentMonth}/{tenure} · {group.filledSeats}/{group.product?.memberCount} seats
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canManage && <button onClick={() => {
              setGroupForm({
                groupNumber: group.groupNumber || '',
                agreementNo: group.agreementNo || '',
                startDate: group.startDate ? new Date(group.startDate).toISOString().slice(0, 10) : '',
              });
              setEditingGroup(true);
            }} className="px-3 py-1 border text-sm rounded-lg">Edit Details</button>}
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              group.status === 'ACTIVE' ? 'bg-green-100 text-green-700'
                : group.status === 'OPEN' ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            }`}>{group.status}</span>
            {canManage && group.status === 'DRAFT' && (
              <button onClick={() => statusMutation.mutate('OPEN')}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg">Open Enrollment</button>
            )}
            {canManage && group.status === 'OPEN' && (
              <button onClick={() => statusMutation.mutate('ACTIVE')}
                disabled={statusMutation.isPending || active.length + prized.length === 0}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg disabled:opacity-50"
                title={active.length + prized.length === 0 ? 'Activate members first' : 'Start the monthly cycle'}>
                Start Group
              </button>
            )}
          </div>
        </div>
        {statusMutation.isError && (
          <p className="mt-3 text-sm text-red-600">{(statusMutation.error as any)?.message}</p>
        )}

        {editingGroup && (
          <form onSubmit={(event) => { event.preventDefault(); editGroupMutation.mutate(); }}
            className="mt-5 pt-5 border-t space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="text-sm">Group number
                <input required value={groupForm.groupNumber}
                  onChange={(event) => setGroupForm({ ...groupForm, groupNumber: event.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-lg" />
              </label>
              <label className="text-sm">Agreement number
                <input value={groupForm.agreementNo}
                  onChange={(event) => setGroupForm({ ...groupForm, agreementNo: event.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-lg" />
              </label>
              <label className="text-sm">Start date
                <input required type="date" value={groupForm.startDate}
                  disabled={group.status === 'ACTIVE'}
                  onChange={(event) => setGroupForm({ ...groupForm, startDate: event.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-lg disabled:bg-gray-100" />
              </label>
            </div>
            {editGroupMutation.isError && (
              <p className="text-sm text-red-600">{(editGroupMutation.error as any)?.message}</p>
            )}
            <div className="flex gap-2">
              <button disabled={editGroupMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">
                {editGroupMutation.isPending ? 'Saving...' : 'Save Group'}
              </button>
              <button type="button" onClick={() => setEditingGroup(false)}
                className="px-4 py-2 border text-sm rounded-lg">Cancel</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t text-sm">
          <div><span className="text-gray-500">Chit Value</span><p className="font-semibold">{formatCurrency(group.product?.chitValuePaise)}</p></div>
          <div><span className="text-gray-500">EMI (Not Lifted)</span><p className="font-semibold">{formatCurrency(group.product?.baseInstallmentPaise)}</p></div>
          <div><span className="text-gray-500">EMI (After Lift)</span><p className="font-semibold">{formatCurrency(group.product?.liftedInstallmentPaise)}</p></div>
          <div><span className="text-gray-500">Collected</span><p className="font-semibold text-green-600">{formatCurrency(group.totalCollectedPaise || 0)}</p></div>
        </div>
      </div>

      {canManage && approved.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center flex-wrap gap-3">
          <div>
            <p className="text-sm text-amber-800">
              {approved.length} approved member(s) ready to activate
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Activating creates their monthly installment schedule and starts the cycle.
            </p>
          </div>
          <button onClick={() => activateMutation.mutate()} disabled={activateMutation.isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg">
            {activateMutation.isPending ? '...' : 'Activate All'}
          </button>
        </div>
      )}

      {(approveMutation.isError || activateMutation.isError || liftMutation.isError) && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
          {(approveMutation.error as any)?.message
            || (activateMutation.error as any)?.message
            || (liftMutation.error as any)?.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { key: 'months' as const, label: `Monthly Status (${tenure})` },
          { key: 'members' as const, label: `Members (${seated.length})` },
          { key: 'requests' as const, label: `Requests (${requested.length})` },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* MONTHS TAB */}
      {tab === 'months' && (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end gap-2">
              <button
                onClick={() => remindUnpaidMutation.mutate(activeMonthView)}
                disabled={remindUnpaidMutation.isPending}
                className="text-sm px-3 py-1 bg-amber-50 border border-amber-300 text-amber-700 rounded hover:bg-amber-100 disabled:opacity-50"
              >
                {remindUnpaidMutation.isPending ? 'Sending...' : `Notify Unpaid (Month ${activeMonthView})`}
              </button>
              <a href={`/api/export/groups/${id}/months`}
                className="text-sm px-3 py-1 bg-gray-100 border rounded hover:bg-gray-200">
                Export Months CSV
              </a>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: tenure }, (_, i) => i + 1).map((m) => {
              const info = months.find((x: any) => x.monthNumber === m);
              const isSel = activeMonthView === m;
              return (
                <button key={m} onClick={() => setSelectedMonth(m)}
                  className={`w-10 h-10 rounded-lg text-sm font-medium border transition ${
                    isSel ? 'bg-blue-600 text-white border-blue-600'
                      : info?.lifted ? 'bg-green-50 border-green-300 text-green-700'
                      : info?.isPast ? 'bg-gray-100 border-gray-200 text-gray-600'
                      : info?.isCurrent ? 'bg-amber-50 border-amber-300 text-amber-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-blue-300'
                  }`}
                  title={info?.lifted ? `Lifted by ${info.lifted.name}` : `Month ${m}`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          {monthView && (
            <div className="bg-white rounded-xl border p-6 space-y-5">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Month {monthView.monthNumber}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Scheduled lift payout: <strong>{formatCurrency(monthView.scheduledPayoutPaise)}</strong>
                    {' · '}
                    Paid: {monthView.paidCount}/{monthView.totalMembers}
                  </p>
                </div>
                {monthView.lifted ? (
                  <div className="bg-green-50 rounded-lg px-4 py-2 text-sm">
                    <p className="text-green-800 font-medium">
                      Lifted by {monthView.lifted.name}
                      {monthView.lifted.seatLabel ? ` (${monthView.lifted.seatLabel})` : ''}
                    </p>
                    <p className="text-green-600">
                      Ticket #{monthView.lifted.ticketNumber}
                      {monthView.lifted.liftedAt && ` · ${formatDate(monthView.lifted.liftedAt)}`}
                    </p>
                    <Link href={`/admin/customers/${monthView.lifted.customerId}`}
                      className="text-blue-600 hover:underline text-xs">View member →</Link>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg px-4 py-2 text-sm text-gray-500">
                    No one lifted this month yet
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">Ticket</th>
                      <th className="pb-2 font-medium">Member</th>
                      <th className="pb-2 font-medium">Due</th>
                      <th className="pb-2 font-medium">Paid</th>
                      <th className="pb-2 font-medium">Paid On</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(monthView.payments?.length ? monthView.payments : seated.map((m: any) => ({
                      memberId: m.id,
                      customerId: m.customerId,
                      ticketNumber: m.ticketNumber,
                      seatLabel: m.seatLabel,
                      name: m.customer?.name,
                      dueAmountPaise: group.product?.baseInstallmentPaise,
                      paidAmountPaise: 0,
                      paidDate: null,
                      installmentStatus: 'UPCOMING',
                      hasPendingVerification: false,
                    }))).map((row: any) => (
                      <tr key={row.memberId} className="border-b last:border-0">
                        <td className="py-2.5">{row.ticketNumber ? `#${row.ticketNumber}` : '—'}</td>
                        <td className="py-2.5">
                          <Link href={`/admin/customers/${row.customerId}`} className="text-blue-600 hover:underline">
                            {row.name}
                          </Link>
                          {row.seatLabel && (
                            <span className="block text-xs text-gray-500">{row.seatLabel}</span>
                          )}
                        </td>
                        <td className="py-2.5">{formatCurrency(row.dueAmountPaise || 0)}</td>
                        <td className="py-2.5">{formatCurrency(row.paidAmountPaise || 0)}</td>
                        <td className="py-2.5 text-gray-500">
                          {row.paidDate ? formatDate(row.paidDate) : '—'}
                        </td>
                        <td className="py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            row.installmentStatus === 'PAID' ? 'bg-green-100 text-green-700'
                              : row.hasPendingVerification ? 'bg-amber-100 text-amber-700'
                              : row.installmentStatus === 'OVERDUE' ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {row.hasPendingVerification ? 'PENDING VERIFY' : row.installmentStatus}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          {canManage && row.installmentId && row.installmentStatus !== 'PAID' && row.installmentStatus !== 'WAIVED' && !row.hasPendingVerification && (
                            <button
                              onClick={() => {
                                setMarkPaidTarget({
                                  installmentId: row.installmentId,
                                  memberId: row.memberId,
                                  balancePaise: Number(row.balancePaise || row.dueAmountPaise || 0),
                                  name: row.name,
                                });
                                setMarkPaidForm({
                                  amount: String(Number(row.balancePaise || row.dueAmountPaise || 0) / 100),
                                  method: 'CASH',
                                  date: new Date().toISOString().slice(0, 10),
                                  notes: '',
                                });
                              }}
                              className="px-2 py-1 border border-blue-300 text-blue-700 text-xs rounded hover:bg-blue-50 mr-1">
                              Mark Paid
                            </button>
                          )}
                          {canManage && !monthView.lifted && active.some((a: any) => a.id === row.memberId) && (
                            confirmLift?.memberId === row.memberId && confirmLift?.month === activeMonthView ? (
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => liftMutation.mutate({ memberId: row.memberId, monthNumber: activeMonthView })}
                                  disabled={liftMutation.isPending}
                                  className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                                  Confirm ({formatCurrency(monthView.scheduledPayoutPaise)})
                                </button>
                                <button onClick={() => setConfirmLift(null)}
                                  className="px-2 py-1 border text-xs rounded">Cancel</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmLift({ memberId: row.memberId, month: activeMonthView })}
                                className="px-2 py-1 border border-green-300 text-green-700 text-xs rounded hover:bg-green-50">
                                Mark Lifted
                              </button>
                            )
                          )}
                          {monthView.lifted?.memberId === row.memberId && (
                            <span className="text-xs text-green-600 font-medium">Lifted</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mark as Paid inline form */}
          {markPaidTarget && (
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-gray-900">
                  Mark as Paid — {markPaidTarget.name}
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
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={markPaidForm.amount}
                    onChange={(e) => setMarkPaidForm({ ...markPaidForm, amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Method</label>
                  <select
                    value={markPaidForm.method}
                    onChange={(e) => setMarkPaidForm({ ...markPaidForm, method: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="NEFT">NEFT</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={markPaidForm.date}
                    onChange={(e) => setMarkPaidForm({ ...markPaidForm, date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                  <input
                    value={markPaidForm.notes}
                    onChange={(e) => setMarkPaidForm({ ...markPaidForm, notes: e.target.value })}
                    placeholder="Optional"
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
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
                <button onClick={() => setMarkPaidTarget(null)} className="px-4 py-2 border text-sm rounded-lg">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MEMBERS TAB */}
      {tab === 'members' && (
        <div className="space-y-4">
          {canManage && <AddSeatForm groupId={String(id)} />}
          <div className="bg-white rounded-xl border p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-3 font-medium">Ticket</th>
                <th className="pb-3 font-medium">Member</th>
                <th className="pb-3 font-medium">Seat name</th>
                <th className="pb-3 font-medium">Phone</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Lifted Month</th>
                <th className="pb-3 font-medium">Current EMI</th>
              </tr>
            </thead>
            <tbody>
              {seated.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-500">
                    No seats taken yet. Approve a join request or add a seat above.
                  </td>
                </tr>
              )}
              {[...seated].sort((a: any, b: any) => (a.ticketNumber || 0) - (b.ticketNumber || 0)).map((m: any) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-3">{m.ticketNumber ? `#${m.ticketNumber}` : '—'}</td>
                  <td className="py-3">
                    <Link href={`/admin/customers/${m.customerId}`} className="text-blue-600 hover:underline font-medium">
                      {m.customer?.name}
                    </Link>
                  </td>
                  <td className="py-3 text-gray-700">{m.seatLabel || '—'}</td>
                  <td className="py-3 text-gray-500">{m.customer?.phone}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${MEMBER_BADGE[m.status] || 'bg-gray-100 text-gray-600'}`}>
                      {MEMBER_LABEL[m.status] || m.status}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500">{m.prizedMonth ? `Month ${m.prizedMonth}` : '—'}</td>
                  <td className="py-3 font-medium">
                    {formatCurrency(m.status === 'PRIZED'
                      ? group.product?.liftedInstallmentPaise
                      : group.product?.baseInstallmentPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* REQUESTS TAB */}
      {tab === 'requests' && (
        <div className="bg-white rounded-xl border p-6">
          {requested.length === 0 ? (
            <p className="text-gray-500 text-sm">No pending join requests.</p>
          ) : (
            <div className="space-y-3">
              {requested.map((m: any) => (
                <div key={m.id} className="flex justify-between items-center py-3 border-b last:border-0">
                  <div>
                    <Link href={`/admin/customers/${m.customerId}`} className="font-medium text-blue-600 hover:underline">
                      {m.customer?.name}
                    </Link>
                    <p className="text-sm text-gray-500">
                      {m.seatLabel ? `${m.seatLabel} · ` : ''}
                      {m.customer?.phone} · KYC: {m.customer?.kycStatus}
                    </p>
                  </div>
                  {canManage && <div className="flex gap-2">
                    <button onClick={() => approveMutation.mutate(m.id)}
                      className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg">Approve</button>
                    <button
                      onClick={() => {
                        const reason = prompt('Rejection reason (optional):');
                        if (reason !== null) rejectMutation.mutate({ memberId: m.id, reason: reason || undefined });
                      }}
                      disabled={rejectMutation.isPending}
                      className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg disabled:opacity-50">Reject</button>
                  </div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
