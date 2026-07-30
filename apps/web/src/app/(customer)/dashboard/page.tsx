'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export default function CustomerDashboard() {
  const { data: memberships, isLoading } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: () => api.get<any[]>('/memberships/my'),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const active = memberships?.filter((m) => m.status === 'ACTIVE' || m.status === 'PRIZED') || [];
  const pending = memberships?.filter((m) => m.status === 'REQUESTED' || m.status === 'APPROVED') || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome Back</h1>
        <p className="text-gray-500 mt-1">Here&apos;s a summary of your chit memberships.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Active Chits</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{active.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Pending Requests</p>
          <p className="text-3xl font-bold text-amber-500 mt-1">{pending.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Total Enrolled</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{memberships?.length || 0}</p>
        </div>
      </div>

      {active.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Your Active Chits</h2>
          <div className="space-y-3">
            {active.map((m: any) => (
              <Link
                key={m.id}
                href={`/my-chits/${m.id}`}
                className="block bg-white rounded-xl border p-5 hover:border-blue-300 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {m.group.product.name}
                      {m.seatLabel ? (
                        <span className="ml-2 text-sm font-normal text-blue-600">· {m.seatLabel}</span>
                      ) : null}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {m.group.product.tenureMonths} months · Chit Value: {formatCurrency(m.group.product.chitValuePaise)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    m.status === 'PRIZED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {m.status === 'PRIZED' ? 'Lifted' : 'Active'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Monthly EMI</span>
                    <p className="font-medium">
                      {m.status === 'PRIZED'
                        ? formatCurrency(m.group.product.liftedInstallmentPaise)
                        : formatCurrency(m.group.product.baseInstallmentPaise)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Payout on Lifting</span>
                    <p className="font-medium">{formatCurrency(m.group.product.payoutAmountPaise)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Pending Requests</h2>
          <div className="space-y-3">
            {pending.map((m: any) => (
              <div key={m.id} className="bg-white rounded-xl border p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {m.group.product.name}
                      {m.seatLabel ? (
                        <span className="ml-2 text-sm font-normal text-blue-600">· {m.seatLabel}</span>
                      ) : null}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {m.status === 'APPROVED'
                        ? 'Approved — your monthly schedule starts when the group begins'
                        : 'Awaiting admin approval'}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                    {m.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(!memberships || memberships.length === 0) && (
        <div className="text-center py-12">
          <p className="text-gray-500">You haven&apos;t joined any chits yet.</p>
          <Link href="/available" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
            Browse available groups
          </Link>
        </div>
      )}
    </div>
  );
}
