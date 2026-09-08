'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createGroupSchema } from '@chitfund/shared';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const groupFormSchema = createGroupSchema.extend({
  startDate: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), {
      message: 'Must be YYYY-MM-DD format',
    }),
});

type GroupForm = z.infer<typeof groupFormSchema>;

export default function AdminGroupsPage() {
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_ADMIN';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GroupForm>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: { productId: '', groupNumber: '', startDate: '' },
  });

  const { data: groups, isLoading } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: () => api.get<any[]>('/groups'),
  });

  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => api.get<any[]>('/products?includeInactive=true'),
  });

  const createMutation = useMutation({
    mutationFn: (data: GroupForm) => api.post('/groups', {
      productId: data.productId,
      groupNumber: data.groupNumber,
      startDate: data.startDate || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-groups'] });
      setShowForm(false);
      reset({ productId: '', groupNumber: '', startDate: '' });
      setError('');
    },
    onError: (err: any) => setError(err.message),
  });

  const onSubmit = (data: GroupForm) => {
    setError('');
    createMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
          <p className="text-gray-500 mt-1">Manage chit batches</p>
        </div>
        {canManage && <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ New Group'}
        </button>}
      </div>

      {canManage && showForm && (
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl border p-6 space-y-4">
          <h3 className="font-semibold text-gray-800">Create New Group</h3>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
              <select
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                size={Math.min((products?.length || 0) + 1, 8)}
                {...register('productId')}
              >
                <option value="">Select product</option>
                {products?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.chitValuePaise)} ({p.memberCount} members, {p.tenureMonths} months){p.isActive === false ? ' [INACTIVE]' : ''}</option>
                ))}
              </select>
              {errors.productId && (
                <p className="text-xs text-red-500 mt-1">{errors.productId.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Batch Code *</label>
              <input
                type="text"
                placeholder="e.g. GRP-2026-001"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                {...register('groupNumber')}
              />
              {errors.groupNumber && (
                <p className="text-xs text-red-500 mt-1">{errors.groupNumber.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                {...register('startDate')}
              />
              {errors.startDate && (
                <p className="text-xs text-red-500 mt-1">{errors.startDate.message}</p>
              )}
            </div>
          </div>
          <button type="submit" disabled={createMutation.isPending}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {createMutation.isPending ? 'Creating...' : 'Create Group'}
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : !groups || groups.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No groups yet.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map((g: any) => (
            <Link key={g.id} href={`/admin/groups/${g.id}`}
              className="block bg-white rounded-xl border p-5 hover:border-blue-300 transition">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900">{g.product?.name} - {g.groupNumber}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {g.filledSeats}/{g.product?.memberCount} members &middot; Month {g.currentMonth}/{g.product?.tenureMonths}
                  </p>
                  <div className="flex gap-2 mt-2">
                    {g.memberCounts?.requested > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                        {g.memberCounts.requested} request(s) pending
                      </span>
                    )}
                    {g.memberCounts?.approved > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {g.memberCounts.approved} to activate
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  g.status === 'ACTIVE' ? 'bg-green-100 text-green-700'
                    : g.status === 'OPEN' ? 'bg-blue-100 text-blue-700'
                    : g.status === 'COMPLETED' ? 'bg-gray-100 text-gray-600'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {g.status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                <div><span className="text-gray-500">Collected</span><p className="font-medium">{formatCurrency(g.totalCollectedPaise || 0)}</p></div>
                <div><span className="text-gray-500">Disbursed</span><p className="font-medium">{formatCurrency(g.totalDisbursedPaise || 0)}</p></div>
                <div><span className="text-gray-500">Start Date</span><p className="font-medium">{g.startDate ? formatDate(g.startDate) : 'Not set'}</p></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
