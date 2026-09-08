'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

function formatPaiseAxis(value: number) {
  const rupees = value / 100;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}k`;
  return `₹${rupees.toFixed(0)}`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-lg shadow-sm px-3 py-2 text-sm">
      <p className="font-medium text-gray-800">{label}</p>
      <p className="text-green-600">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

function MethodTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-lg shadow-sm px-3 py-2 text-sm">
      <p className="font-medium text-gray-800">{label}</p>
      <p className="text-blue-600">{payload[0].value} payments</p>
    </div>
  );
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get<any>('/groups/stats'),
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => api.get<any>('/analytics'),
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

  const collectionTrend = analytics?.collectionTrend ?? stats?.collectionTrend ?? [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/groups" className="bg-white rounded-xl p-5 border hover:border-blue-300 transition">
          <p className="text-sm text-gray-500">Active Groups</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">{stats?.activeGroups || 0}</p>
        </Link>
        <Link href="/admin/customers" className="bg-white rounded-xl p-5 border hover:border-blue-300 transition">
          <p className="text-sm text-gray-500">Total Customers</p>
          <p className="text-3xl font-bold text-gray-800 mt-1">{stats?.totalCustomers || 0}</p>
        </Link>
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Collected This Month</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{formatCurrency(stats?.collectedThisMonth || 0)}</p>
        </div>
        <Link href="/admin/payments" className="bg-white rounded-xl p-5 border hover:border-amber-300 transition">
          <p className="text-sm text-gray-500">Pending Payments</p>
          <p className="text-3xl font-bold text-amber-500 mt-1">{stats?.pendingPayments || 0}</p>
        </Link>
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Overdue Installments</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{stats?.overdueInstallments || 0}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border">
          <p className="text-sm text-gray-500">Defaulting Members</p>
          <p className="text-3xl font-bold text-red-500 mt-1">{stats?.defaultingMembers || 0}</p>
        </div>
        <Link href="/admin/customers" className="bg-white rounded-xl p-5 border hover:border-indigo-300 transition">
          <p className="text-sm text-gray-500">New Members This Month</p>
          <p className="text-3xl font-bold text-indigo-600 mt-1">{stats?.newCustomersThisMonth || 0}</p>
        </Link>
        <Link href="/admin/payments" className="bg-white rounded-xl p-5 border hover:border-amber-300 transition">
          <p className="text-sm text-gray-500">Pending Verifications</p>
          <p className="text-3xl font-bold text-amber-500 mt-1">{pendingPayments?.meta?.total || 0}</p>
        </Link>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Collection Trend</h2>
          {analyticsLoading ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">Loading chart...</div>
          ) : collectionTrend.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">No collection data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={collectionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatPaiseAxis} tick={{ fontSize: 12 }} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ fill: '#16a34a', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Payment Methods</h2>
          {analyticsLoading ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">Loading chart...</div>
          ) : !analytics?.paymentMethods?.length ? (
            <div className="h-[300px] flex items-center justify-center text-gray-500 text-sm">No payment data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.paymentMethods}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="method" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={40} />
                <Tooltip content={<MethodTooltip />} />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
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
