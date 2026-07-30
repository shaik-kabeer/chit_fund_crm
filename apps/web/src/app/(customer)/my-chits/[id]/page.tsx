'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useState } from 'react';

type PayMethod = 'UPI' | 'CASH';

function SeatRename({ memberId, currentLabel }: { memberId: string; currentLabel?: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(currentLabel || '');

  const rename = useMutation({
    mutationFn: () => api.patch(`/memberships/${memberId}/label`, { seatLabel: label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['membership-detail', memberId] });
      queryClient.invalidateQueries({ queryKey: ['my-memberships'] });
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <button
        onClick={() => { setLabel(currentLabel || ''); setEditing(true); }}
        className="mt-3 text-xs text-blue-600 hover:underline"
      >
        Rename this seat
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Seat name"
        className="px-3 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        onClick={() => rename.mutate()}
        disabled={rename.isPending || !label.trim()}
        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50"
      >
        Save
      </button>
      <button onClick={() => setEditing(false)} className="px-3 py-1.5 border text-xs rounded-lg">
        Cancel
      </button>
    </div>
  );
}

export default function ChitDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [payingInst, setPayingInst] = useState<any | null>(null);
  const [method, setMethod] = useState<PayMethod>('UPI');
  const [txnRef, setTxnRef] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const { data: membership, isLoading } = useQuery({
    queryKey: ['membership-detail', id],
    queryFn: () => api.get<any>(`/memberships/my/${id}`),
    enabled: !!id,
  });

  const { data: orgPay } = useQuery({
    queryKey: ['org-payment-info'],
    queryFn: () => api.get<any>('/payments/org-info'),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!payingInst) throw new Error('No installment selected');
      let screenshotUrl: string | undefined;

      if (method === 'UPI') {
        if (!screenshot) throw new Error('Please attach payment screenshot');
        if (!txnRef.trim()) throw new Error('Enter UPI transaction / reference ID');
        const uploaded = await api.upload<{ url: string }>('/uploads/payment-screenshot', screenshot);
        screenshotUrl = uploaded.url;
      }

      return api.post('/payments/submit', {
        installmentId: payingInst.id,
        amountPaise: Number(payingInst.balancePaise),
        method,
        transactionRef: method === 'UPI' ? txnRef.trim() : undefined,
        paymentDate: new Date().toISOString().slice(0, 10),
        screenshotUrl,
      });
    },
    onSuccess: () => {
      setSuccess('Payment request submitted. Waiting for collector/admin verification.');
      setPayingInst(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['membership-detail', id] });
    },
    onError: (err: any) => setError(err.message || 'Failed to submit'),
  });

  const resetForm = () => {
    setMethod('UPI');
    setTxnRef('');
    setScreenshot(null);
    setPreview(null);
    setError('');
  };

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!membership) return <div className="text-center py-12 text-gray-500">Not found</div>;

  const product = membership.group.product;
  const installments = membership.installments || [];
  const paid = installments.filter((i: any) => i.status === 'PAID');
  const pendingVerify = installments.filter((i: any) =>
    (i.payments || []).some((p: any) => p.status === 'PENDING'),
  );
  const rejected = installments.filter((i: any) =>
    i.payments?.[0]?.status === 'REJECTED',
  );
  const due = installments.filter((i: any) =>
    ['UPCOMING', 'DUE', 'OVERDUE', 'PARTIALLY_PAID'].includes(i.status) &&
    !(i.payments || []).some((p: any) => p.status === 'PENDING') &&
    i.status !== 'PAID',
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {product.name}
              {membership.seatLabel ? (
                <span className="ml-2 text-lg font-semibold text-blue-600">· {membership.seatLabel}</span>
              ) : null}
            </h1>
            <p className="text-gray-500 mt-1">
              Group {membership.group.groupNumber}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            membership.status === 'PRIZED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {membership.status === 'PRIZED' ? 'Lifted' : 'Active'}
          </span>
        </div>

        <SeatRename memberId={membership.id} currentLabel={membership.seatLabel} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mt-6 pt-6 border-t">
          <div>
            <span className="text-sm text-gray-500">Chit Value</span>
            <p className="text-lg font-semibold">{formatCurrency(product.chitValuePaise)}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Your Monthly EMI</span>
            <p className="text-lg font-semibold">
              {membership.status === 'PRIZED'
                ? formatCurrency(product.liftedInstallmentPaise)
                : formatCurrency(product.baseInstallmentPaise)}
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-500">EMI if Lifted</span>
            <p className="text-lg font-semibold">{formatCurrency(product.liftedInstallmentPaise)}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Tenure</span>
            <p className="text-lg font-semibold">{product.tenureMonths} months</p>
          </div>
        </div>
      </div>

      {success && (
        <div className="bg-green-50 text-green-700 p-4 rounded-lg text-sm">{success}</div>
      )}

      {/* Raise payment */}
      {payingInst && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Raise payment request — Month {payingInst.monthNumber}
          </h2>
          <p className="text-sm text-gray-500">
            Amount: <strong>{formatCurrency(payingInst.balancePaise)}</strong>
          </p>

          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          <div className="flex gap-2">
            <button type="button" onClick={() => { setMethod('UPI'); setError(''); }}
              className={`flex-1 py-3 rounded-lg border text-sm font-medium ${
                method === 'UPI' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200'
              }`}>
              Online / UPI
              <span className="block text-xs font-normal text-gray-500 mt-0.5">Pay then upload screenshot</span>
            </button>
            <button type="button" onClick={() => { setMethod('CASH'); setError(''); }}
              className={`flex-1 py-3 rounded-lg border text-sm font-medium ${
                method === 'CASH' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200'
              }`}>
              Cash (Offline)
              <span className="block text-xs font-normal text-gray-500 mt-0.5">Raise request directly</span>
            </button>
          </div>

          {method === 'UPI' && (
            <div className="space-y-3 p-4 bg-blue-50 rounded-lg text-sm">
              <p className="font-medium text-blue-900">Pay to our UPI / mobile</p>
              <div className="grid sm:grid-cols-2 gap-2 text-blue-800">
                <p>UPI ID: <strong>{orgPay?.paymentUpiId || '—'}</strong></p>
                <p>Phone: <strong>{orgPay?.paymentPhone || orgPay?.phone || '—'}</strong></p>
              </div>
              <p className="text-blue-700 text-xs">
                After paying, enter the UPI reference and attach the payment screenshot.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">UPI Transaction / Ref ID *</label>
                <input type="text" value={txnRef} onChange={(e) => setTxnRef(e.target.value)}
                  placeholder="e.g. 123456789012"
                  className="w-full px-3 py-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Screenshot *</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setScreenshot(f);
                    setPreview(f ? URL.createObjectURL(f) : null);
                  }}
                  className="w-full text-sm"
                />
                {preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Screenshot preview" className="mt-2 max-h-40 rounded border" />
                )}
              </div>
            </div>
          )}

          {method === 'CASH' && (
            <div className="p-4 bg-amber-50 rounded-lg text-sm text-amber-800">
              You are raising a cash payment request. Collector/admin will verify and mark it as received.
              No screenshot is required.
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit Payment Request'}
            </button>
            <button onClick={() => { setPayingInst(null); resetForm(); }}
              className="px-5 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Awaiting verification */}
      {pendingVerify.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Awaiting Verification</h2>
          <div className="divide-y">
            {pendingVerify.map((inst: any) => {
              const pending = (inst.payments || []).find((p: any) => p.status === 'PENDING');
              return (
                <div key={inst.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium">Month {inst.monthNumber}</p>
                    <p className="text-sm text-gray-500">
                      {pending?.method} · Submitted {pending?.submittedAt ? formatDate(pending.submittedAt) : ''}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">PENDING</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rejected requests remain visible with the admin's review note. */}
      {rejected.length > 0 && (
        <div className="bg-white rounded-xl border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Rejected Payment Requests</h2>
          <p className="text-sm text-gray-500 mb-3">Review the reason, correct the payment details and submit again.</p>
          <div className="divide-y">
            {rejected.map((inst: any) => {
              const payment = inst.payments?.[0];
              return (
                <div key={inst.id} className="py-4 flex justify-between items-start gap-4">
                  <div>
                    <p className="font-medium">Month {inst.monthNumber} · {formatCurrency(payment?.amountPaise || inst.balancePaise)}</p>
                    <p className="mt-1 text-sm text-red-700">
                      Review: <strong>{payment?.rejectionReason || 'No reason provided'}</strong>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {payment?.method}{payment?.rejectedAt ? ` · Rejected ${formatDate(payment.rejectedAt)}` : ''}
                    </p>
                  </div>
                  {!payingInst && (
                    <button onClick={() => { setPayingInst(inst); setSuccess(''); resetForm(); }}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg whitespace-nowrap">
                      Submit Again
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Due months */}
      {due.length > 0 && !payingInst && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Pending Payments</h2>
          <div className="divide-y">
            {due.map((inst: any) => (
              <div key={inst.id} className="py-3 flex justify-between items-center gap-3">
                <div>
                  <p className="font-medium text-gray-900">Month {inst.monthNumber}</p>
                  <p className="text-sm text-gray-500">Due: {formatDate(inst.dueDate)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(inst.balancePaise)}</p>
                    <span className={`text-xs ${inst.status === 'OVERDUE' ? 'text-red-600' : 'text-amber-600'}`}>
                      {inst.status}
                    </span>
                  </div>
                  <button
                    onClick={() => { setPayingInst(inst); setSuccess(''); resetForm(); }}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    Raise Paid Request
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {product.payoutSchedule?.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Payout if you lift in each month</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {product.payoutSchedule.map((s: any) => (
              <div key={s.monthNumber} className="rounded-lg px-3 py-2 bg-gray-50">
                <span className="text-xs text-gray-500">Month {s.monthNumber}</span>
                <p className="font-semibold">{formatCurrency(s.payoutAmountPaise)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Payment History</h2>
        {paid.length === 0 ? (
          <p className="text-gray-500 text-sm">No verified payments yet.</p>
        ) : (
          <div className="divide-y">
            {paid.map((inst: any) => {
              const verified = (inst.payments || []).find((p: any) => p.status === 'VERIFIED');
              return (
                <div key={inst.id} className="py-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-900">Month {inst.monthNumber}</p>
                    <p className="text-sm text-gray-500">
                      {verified?.paymentDate ? `Paid on ${formatDate(verified.paymentDate)}` : ''}
                      {verified?.method ? ` · ${verified.method}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-green-700">{formatCurrency(inst.netAmountPaise)}</p>
                    <span className="text-xs text-green-600">PAID</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
