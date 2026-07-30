'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { useState } from 'react';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [kycReason, setKycReason] = useState('');

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

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!customer) return <div className="text-center py-12 text-gray-500">Customer not found</div>;

  const memberships = customer.memberships || [];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            <p className="text-gray-500 mt-1">{customer.phone} · {customer.email || 'No email'}</p>
          </div>
          <div className="flex gap-2 items-center">
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
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              customer.kycStatus === 'VERIFIED' ? 'bg-green-100 text-green-700'
                : customer.kycStatus === 'PENDING' || customer.kycStatus === 'SUBMITTED' ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700'
            }`}>{customer.kycStatus}</span>
          </div>
        </div>

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
        {customer.kycStatus === 'SUBMITTED' && (
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
            const installments = m.installments || [];
            const paid = installments.filter((i: any) => i.status === 'PAID' || i.status === 'PARTIALLY_PAID');
            const pending = installments.filter((i: any) => ['DUE', 'OVERDUE', 'UPCOMING'].includes(i.status));

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
                          ? `Month ${m.liftInfo.prizedMonth}${m.liftInfo.prizedAt ? ` (${formatDate(m.liftInfo.prizedAt)})` : ''}`
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
                          Lifted in <strong>month {m.liftInfo.prizedMonth}</strong>
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

                    {/* Monthly payout schedule for this product */}
                    {product?.payoutSchedule?.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Payout if lifted in each month</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                          {product.payoutSchedule.map((s: any) => (
                            <div key={s.monthNumber}
                              className={`rounded px-2 py-1.5 ${
                                m.prizedMonth === s.monthNumber ? 'bg-green-100 border border-green-300' : 'bg-gray-50'
                              }`}>
                              <span className="text-gray-500">M{s.monthNumber}</span>
                              <p className="font-medium">{formatCurrency(s.payoutAmountPaise)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Payment history */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">
                        Payment history ({paid.length} paid · {pending.filter((i: any) => i.status !== 'UPCOMING').length} pending)
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
                            </tr>
                          </thead>
                          <tbody>
                            {installments.map((inst: any) => {
                              const verified = (inst.payments || []).find((p: any) => p.status === 'VERIFIED');
                              return (
                                <tr key={inst.id} className="border-b last:border-0">
                                  <td className="py-2">Month {inst.monthNumber}</td>
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
                                      inst.status === 'PAID' ? 'bg-green-100 text-green-700'
                                        : inst.status === 'OVERDUE' ? 'bg-red-100 text-red-700'
                                        : inst.status === 'DUE' ? 'bg-amber-100 text-amber-700'
                                        : 'bg-gray-100 text-gray-600'
                                    }`}>{inst.status}</span>
                                  </td>
                                </tr>
                              );
                            })}
                            {installments.length === 0 && (
                              <tr><td colSpan={5} className="py-3 text-gray-500">No installment schedule yet.</td></tr>
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
