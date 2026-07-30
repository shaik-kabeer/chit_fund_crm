'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<any>('/groups/stats'),
  });

  const { data: pendingRequests } = useQuery({
    queryKey: ['pending-requests'],
    queryFn: () => api.get<any[]>('/memberships/pending'),
  });

  const { data: pendingPayments } = useQuery({
    queryKey: ['pending-payments'],
    queryFn: () => api.get<any>('/payments/pending?page=1&limit=5'),
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Active Groups</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{stats?.activeGroups || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Total Customers</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{stats?.totalCustomers || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Collected This Month</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{formatCurrency(stats?.collectedThisMonth || 0)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Pending Verifications</p>
          <p className="text-3xl font-bold text-amber-500 mt-1">{pendingPayments?.meta?.total || 0}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Join Requests */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Join Requests</h2>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
              {pendingRequests?.length || 0} pending
            </span>
          </div>
          {!pendingRequests || pendingRequests.length === 0 ? (
            <p className="text-gray-500 text-sm">No pending requests.</p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.slice(0, 5).map((req: any) => (
                <div key={req.id} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{req.customer.name}</p>
                    <p className="text-xs text-gray-500">{req.group.product.name}</p>
                  </div>
                  <Link
                    href={`/admin/groups/${req.groupId}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Review
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Payments */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Payments to Verify</h2>
            <Link href="/admin/payments" className="text-xs text-blue-600 hover:underline">View all</Link>
          </div>
          {!pendingPayments?.data || pendingPayments.data.length === 0 ? (
            <p className="text-gray-500 text-sm">No payments pending verification.</p>
          ) : (
            <div className="space-y-3">
              {pendingPayments.data.map((payment: any) => (
                <div key={payment.id} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {payment.installment?.member?.customer?.name || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {payment.method} &middot; {formatCurrency(payment.amountPaise)}
                    </p>
                  </div>
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                    Pending
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
