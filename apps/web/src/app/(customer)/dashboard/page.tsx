'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';

export default function CustomerDashboard() {
  const user = useAuth((s) => s.user);

  const { data: memberships, isLoading } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: () => api.get<any[]>('/memberships/my'),
  });

  const { data: profile } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => api.get<any>('/customers/profile'),
    enabled: !!user,
  });

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const active = memberships?.filter((m) => m.status === 'ACTIVE' || m.status === 'PRIZED') || [];
  const pending = memberships?.filter((m) => m.status === 'REQUESTED' || m.status === 'APPROVED') || [];
  const rejected = memberships?.filter((m) => m.status === 'REJECTED') || [];
  const defaulting = memberships?.filter((m) => m.status === 'DEFAULTING') || [];

  const kycStatus = profile?.kycStatus || 'PENDING';
  const kycNeedsAction = kycStatus === 'PENDING' || kycStatus === 'REJECTED';

  return (
    <div className="space-y-6">
      {/* Personalized greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="text-gray-500 mt-1">Here&apos;s a summary of your chit memberships.</p>
      </div>

      {/* Action alerts */}
      {(kycNeedsAction || defaulting.length > 0) && (
        <div className="space-y-3">
          {kycNeedsAction && (
            <Link href="/kyc"
              className="block bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📋</span>
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {kycStatus === 'REJECTED'
                      ? 'Your KYC was rejected — please re-submit'
                      : 'Complete your KYC to unlock all features'}
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {kycStatus === 'REJECTED'
                      ? (profile?.kycRejectionReason || 'Check profile for details')
                      : 'Submit your PAN, Aadhaar & address to get verified'}
                  </p>
                </div>
                <span className="ml-auto text-amber-500 text-sm">→</span>
              </div>
            </Link>
          )}
          {defaulting.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-sm font-medium text-red-800">
                    {defaulting.length} membership(s) marked as defaulting
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Please clear your overdue payments to avoid penalties.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/my-chits" className="bg-white rounded-xl p-4 border hover:border-blue-300 transition">
          <p className="text-xs text-gray-500">Active Chits</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{active.length}</p>
        </Link>
        <Link href="/my-chits" className="bg-white rounded-xl p-4 border hover:border-amber-300 transition">
          <p className="text-xs text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">{pending.length}</p>
        </Link>
        <Link href="/available" className="bg-white rounded-xl p-4 border hover:border-green-300 transition">
          <p className="text-xs text-gray-500">Total Enrolled</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{memberships?.length || 0}</p>
        </Link>
        <Link href="/kyc" className="bg-white rounded-xl p-4 border hover:border-indigo-300 transition">
          <p className="text-xs text-gray-500">KYC Status</p>
          <p className={`text-lg font-bold mt-1 ${
            kycStatus === 'VERIFIED' ? 'text-green-600' : kycStatus === 'SUBMITTED' ? 'text-blue-600' : 'text-amber-500'
          }`}>
            {kycStatus === 'VERIFIED' ? '✓ Verified' : kycStatus === 'SUBMITTED' ? 'Under Review' : kycStatus === 'REJECTED' ? 'Rejected' : 'Pending'}
          </p>
        </Link>
      </div>

      {/* Active Chits */}
      {active.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Your Active Chits</h2>
          <div className="space-y-3">
            {active.map((m: any) => (
              <Link key={m.id} href={`/my-chits/${m.id}`}
                className="block bg-white rounded-xl border p-5 hover:border-blue-300 transition">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {m.group.product.name}
                      {m.seatLabel && <span className="ml-2 text-sm font-normal text-blue-600">· {m.seatLabel}</span>}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {m.group.groupNumber} · {m.group.product.tenureMonths} months · Value: {formatCurrency(m.group.product.chitValuePaise)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    m.status === 'PRIZED' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {m.status === 'PRIZED' ? '✓ Lifted' : 'Active'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Monthly EMI</span>
                    <p className="font-semibold">
                      {formatCurrency(m.status === 'PRIZED'
                        ? m.group.product.liftedInstallmentPaise
                        : m.group.product.baseInstallmentPaise)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Payout on Lift</span>
                    <p className="font-semibold">{formatCurrency(m.group.product.payoutAmountPaise)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Ticket</span>
                    <p className="font-semibold">{m.ticketNumber ? `#${m.ticketNumber}` : 'Pending'}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Defaulting memberships */}
      {defaulting.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-red-700 mb-3">⚠️ Overdue Memberships</h2>
          <div className="space-y-3">
            {defaulting.map((m: any) => (
              <Link key={m.id} href={`/my-chits/${m.id}`}
                className="block bg-red-50 rounded-xl border border-red-200 p-5 hover:bg-red-100 transition">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-gray-900">{m.group.product.name}</h3>
                    <p className="text-sm text-red-600 mt-1">Payments overdue — please pay immediately</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">DEFAULTING</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Pending Requests */}
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
                      {m.seatLabel && <span className="ml-2 text-sm font-normal text-blue-600">· {m.seatLabel}</span>}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {m.status === 'APPROVED'
                        ? '✓ Approved — schedule starts when the group begins'
                        : '⏳ Awaiting admin approval'}
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

      {/* Rejected Requests */}
      {rejected.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Rejected Requests</h2>
          <div className="space-y-3">
            {rejected.map((m: any) => (
              <div key={m.id} className="bg-white rounded-xl border border-red-200 p-5">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-medium text-gray-900">{m.group.product.name}</h3>
                    {m.notes && <p className="text-sm text-red-700 mt-1">Reason: <strong>{m.notes}</strong></p>}
                    <p className="text-sm text-gray-500 mt-1">
                      <Link href="/available" className="text-blue-600 hover:underline">Apply again →</Link>
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">REJECTED</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!memberships || memberships.length === 0) && (
        <div className="text-center py-16 bg-white rounded-xl border">
          <div className="text-5xl mb-4">🏦</div>
          <h3 className="text-lg font-semibold text-gray-800">No chit memberships yet</h3>
          <p className="text-gray-500 mt-1 mb-4">Join a chit group to start saving and earning payouts.</p>
          <Link href="/available"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Browse Available Groups →
          </Link>
        </div>
      )}
    </div>
  );
}
