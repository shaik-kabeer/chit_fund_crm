'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';

const ENTITY_TYPES = ['', 'GroupMember', 'ChitGroup', 'Payment', 'Customer'];
const ACTIONS = [
  '',
  'MEMBERSHIP_APPROVED',
  'MEMBERSHIP_REJECTED',
  'MEMBERS_ACTIVATED',
  'MEMBER_LIFTED',
  'PAYMENT_VERIFIED',
  'PAYMENT_REJECTED',
  'KYC_STATUS_CHANGED',
  'GROUP_STATUS_CHANGED',
];

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');

  const queryParams = new URLSearchParams({ page: String(page), limit: '20' });
  if (entityType) queryParams.set('entityType', entityType);
  if (action) queryParams.set('action', action);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit', page, entityType, action],
    queryFn: () => api.get<any>(`/audit?${queryParams.toString()}`),
  });

  const handleFilterChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <p className="text-gray-500 mt-1">Audit trail of admin actions across the organization.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor="entityType" className="block text-xs text-gray-500 mb-1">Entity Type</label>
          <select
            id="entityType"
            value={entityType}
            onChange={handleFilterChange(setEntityType)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">All</option>
            {ENTITY_TYPES.filter(Boolean).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="action" className="block text-xs text-gray-500 mb-1">Action</label>
          <select
            id="action"
            value={action}
            onChange={handleFilterChange(setAction)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">All</option>
            {ACTIONS.filter(Boolean).map((a) => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {!data?.data || data.data.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Entity Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Entity ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Performed By</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{log.action.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.entityType}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-[120px] truncate" title={log.entityId}>
                      {log.entityId || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.performedBy
                        ? `${log.performedBy.name} (${log.performedBy.role})`
                        : log.actorType === 'customer'
                          ? 'Customer'
                          : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={log.changes ? JSON.stringify(log.changes) : ''}>
                      {log.changes ? JSON.stringify(log.changes) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.meta?.totalPages > 1 && (
            <div className="flex justify-center gap-2 py-4 border-t">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm text-gray-600">
                Page {page} of {data.meta.totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= data.meta.totalPages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
