'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export default function MyChitsPage() {
  const { data: memberships, isLoading } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: () => api.get<any[]>('/memberships/my'),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const active = memberships?.filter((m) =>
    ['APPROVED', 'ACTIVE', 'PRIZED', 'DEFAULTING', 'COMPLETED'].includes(m.status),
  ) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Chits</h1>
        <p className="text-gray-500 mt-1">View all your enrolled chit funds.</p>
      </div>

      {active.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">You don&apos;t have any active chit memberships.</p>
          <Link href="/available" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
            Browse available groups
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {active.map((m: any) => (
            <Link
              key={m.id}
              href={`/my-chits/${m.id}`}
              className="block bg-white rounded-xl border p-5 hover:border-blue-300 transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {m.group.product.name}
                    {m.seatLabel ? (
                      <span className="ml-2 text-sm font-normal text-blue-600">· {m.seatLabel}</span>
                    ) : null}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Group #{m.group.groupNumber}
                    {' · '}{m.group.product.tenureMonths} months
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  m.status === 'PRIZED' ? 'bg-green-100 text-green-700'
                    : m.status === 'COMPLETED' ? 'bg-gray-100 text-gray-600'
                    : m.status === 'APPROVED' ? 'bg-amber-100 text-amber-700'
                    : m.status === 'DEFAULTING' ? 'bg-red-100 text-red-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {m.status === 'PRIZED' ? 'Lifted'
                    : m.status === 'COMPLETED' ? 'Completed'
                    : m.status === 'APPROVED' ? 'Approved · starting soon'
                    : m.status === 'DEFAULTING' ? 'Overdue'
                    : 'Active'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                <div>
                  <span className="text-gray-500">Chit Value</span>
                  <p className="font-medium">{formatCurrency(m.group.product.chitValuePaise)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Your EMI</span>
                  <p className="font-medium">
                    {m.status === 'PRIZED'
                      ? formatCurrency(m.group.product.liftedInstallmentPaise)
                      : formatCurrency(m.group.product.baseInstallmentPaise)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Payout Amount</span>
                  <p className="font-medium">{formatCurrency(m.group.product.payoutAmountPaise)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
