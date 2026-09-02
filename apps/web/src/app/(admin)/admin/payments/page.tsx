'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, resolveUploadUrl } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useState } from 'react';
import Link from 'next/link';

export default function AdminPaymentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ['admin-payments', page],
    queryFn: () => api.get<any>(`/payments/pending?page=${page}&limit=20`),
  });

  const verifyMutation = useMutation({
    mutationFn: (paymentId: string) => api.patch(`/payments/${paymentId}/verify`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-payments'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      api.patch(`/payments/${paymentId}/reject`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-payments'] }),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Verification</h1>
          <p className="text-gray-500 mt-1">
            Review member payment requests (UPI with screenshot or cash). Approve → marked received for admin, paid for member.
          </p>
        </div>
        <a href="/api/export/payments"
          className="text-sm px-3 py-1 bg-gray-100 border rounded hover:bg-gray-200">
          Export CSV
        </a>
      </div>

      {!payments?.data || payments.data.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No payments pending verification.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {payments.data.map((p: any) => {
            const member = p.installment?.member;
            const customer = member?.customer;
            const group = member?.group;
            const isOnline = p.method !== 'CASH';
            const imgUrl = resolveUploadUrl(p.screenshotUrl);

            return (
              <div key={p.id} className="bg-white rounded-xl border p-5">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div>
                    <p className="font-medium text-gray-900">
                      {customer?.id ? (
                        <Link href={`/admin/customers/${customer.id}`} className="text-blue-600 hover:underline">
                          {customer.name}
                        </Link>
                      ) : 'Unknown'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {group?.product?.name} — {group?.groupNumber} · Month {p.installment?.monthNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">{formatCurrency(p.amountPaise)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isOnline ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                    }`}>{p.method}{isOnline ? ' (Online)' : ' (Offline)'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
                  <div>
                    <span className="text-gray-500">Reference</span>
                    <p className="font-medium break-all">{p.transactionRef || '—'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Payment Date</span>
                    <p className="font-medium">{formatDate(p.paymentDate)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Submitted</span>
                    <p className="font-medium">{formatDate(p.submittedAt || p.createdAt)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Receipt #</span>
                    <p className="font-medium">{p.receiptNumber || '—'}</p>
                  </div>
                </div>

                {imgUrl && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-2">Payment screenshot</p>
                    <button type="button" onClick={() => setPreviewUrl(imgUrl)} className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgUrl} alt="Payment proof" className="max-h-40 rounded-lg border hover:opacity-90" />
                    </button>
                  </div>
                )}

                {p.method === 'CASH' && !imgUrl && (
                  <p className="mt-3 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    Cash request — no screenshot required. Confirm with collector before approving.
                  </p>
                )}

                <div className="flex gap-3 mt-4 pt-4 border-t">
                  <button
                    onClick={() => verifyMutation.mutate(p.id)}
                    disabled={verifyMutation.isPending}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve & Mark Received
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Rejection reason:');
                      if (reason) rejectMutation.mutate({ paymentId: p.id, reason });
                    }}
                    disabled={rejectMutation.isPending}
                    className="px-4 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}

          {payments.meta?.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50">Previous</button>
              <span className="px-3 py-1 text-sm text-gray-600">Page {page} of {payments.meta.totalPages}</span>
              <button onClick={() => setPage(page + 1)} disabled={page >= payments.meta.totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Full screenshot" className="max-h-[90vh] max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
