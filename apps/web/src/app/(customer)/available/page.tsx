'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useState } from 'react';

export default function AvailableGroupsPage() {
  const queryClient = useQueryClient();
  const [applying, setApplying] = useState<string | null>(null);
  const [seatLabel, setSeatLabel] = useState('Self');
  const [quantity, setQuantity] = useState(1);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { data: groups, isLoading, isError: loadFailed, error: loadError } = useQuery({
    queryKey: ['available-groups'],
    queryFn: () => api.get<any[]>('/groups/available'),
  });

  const { data: mySeats } = useQuery({
    queryKey: ['my-memberships'],
    queryFn: () => api.get<any[]>('/memberships/my'),
  });

  const applyMutation = useMutation({
    mutationFn: (groupId: string) =>
      api.post(`/memberships/join/${groupId}`, {
        seatLabel: seatLabel.trim() || 'Self',
        quantity,
      }),
    onSuccess: (res: any) => {
      setSuccess(res.message || 'Application submitted! Admin will review your request.');
      setError('');
      queryClient.invalidateQueries({ queryKey: ['available-groups'] });
      queryClient.invalidateQueries({ queryKey: ['my-memberships'] });
      setApplying(null);
      setSeatLabel('Self');
      setQuantity(1);
    },
    onError: (err: any) => setError(err.message || 'Failed to apply'),
  });

  const seatsInGroup = (groupId: string) =>
    (mySeats || []).filter(
      (m) => m.groupId === groupId && !['REJECTED', 'WITHDRAWN'].includes(m.status),
    ).length;

  if (isLoading) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Available Groups</h1>
        <p className="text-gray-500 mt-1">
          You can hold multiple seats in the same group — give each seat a name for easy tracking.
        </p>
      </div>

      {success && <div className="bg-green-50 text-green-700 p-4 rounded-lg text-sm">{success}</div>}
      {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">{error}</div>}
      {loadFailed && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
          Could not load available groups: {(loadError as Error).message}
        </div>
      )}

      {loadFailed ? null : !groups || groups.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No groups are currently open for enrollment.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map((group: any) => {
            const mine = seatsInGroup(group.id);
            return (
              <div key={group.id} className="bg-white rounded-xl border p-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{group.product.name}</h3>
                    {group.product.description && (
                      <p className="text-sm text-gray-500 mt-1">{group.product.description}</p>
                    )}
                    {mine > 0 && (
                      <p className="text-xs text-blue-600 mt-1">You already have {mine} seat(s) here</p>
                    )}
                  </div>
                  <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                    {group.status === 'ACTIVE' ? 'Active · Seats Available' : 'Open'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-sm">
                  <div>
                    <span className="text-gray-500">Chit Value</span>
                    <p className="font-medium">{formatCurrency(group.product.chitValuePaise)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Duration</span>
                    <p className="font-medium">{group.product.tenureMonths} months</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Monthly EMI</span>
                    <p className="font-medium">{formatCurrency(group.product.baseInstallmentPaise)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">From month-1 payout</span>
                    <p className="font-medium">
                      {formatCurrency(
                        group.product.payoutSchedule?.[0]?.payoutAmountPaise
                          ?? group.product.payoutAmountPaise,
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  {applying === group.id ? (
                    <div className="w-full sm:w-auto space-y-3 border rounded-lg p-4 bg-gray-50">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Seat name
                          </label>
                          <input
                            type="text"
                            value={seatLabel}
                            onChange={(e) => setSeatLabel(e.target.value)}
                            placeholder="e.g. Self, Wife, Shop-1"
                            className="w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            How many seats?
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={quantity}
                            onChange={(e) => setQuantity(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                            className="w-full px-3 py-2 border rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => applyMutation.mutate(group.id)}
                          disabled={applyMutation.isPending}
                          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {applyMutation.isPending ? 'Applying...' : 'Submit Request'}
                        </button>
                        <button
                          onClick={() => { setApplying(null); setError(''); }}
                          className="px-4 py-2 border text-sm rounded-lg hover:bg-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setApplying(group.id); setError(''); setSuccess(''); }}
                      className="px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                    >
                      {mine > 0 ? 'Apply for Another Seat' : 'Apply to Join'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
