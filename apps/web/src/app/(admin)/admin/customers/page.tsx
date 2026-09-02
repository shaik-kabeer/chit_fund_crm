'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useState } from 'react';

export default function AdminCustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [createdPassword, setCreatedPassword] = useState('');
  const [error, setError] = useState('');

  const { data: customers, isLoading } = useQuery({
    queryKey: ['admin-customers', search],
    queryFn: () => api.get<any>(`/customers?search=${search}&page=1&limit=50`),
  });

  const createMember = useMutation({
    mutationFn: () => api.post<any>('/customers', {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
    }),
    onSuccess: (result) => {
      setCreatedPassword(result.temporaryPassword);
      setForm({ name: '', phone: '', email: '' });
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    },
    onError: (err: any) => setError(err.message || 'Could not add member'),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 mt-1">Manage all registered members</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/export/customers"
            className="text-sm px-3 py-1 bg-gray-100 border rounded hover:bg-gray-200">
            Export CSV
          </a>
          <button onClick={() => { setShowAdd(!showAdd); setError(''); setCreatedPassword(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">
            {showAdd ? 'Cancel' : '+ Add Member'}
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={(event) => { event.preventDefault(); createMember.mutate(); }}
          className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Add a member account</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <input required placeholder="Full name" value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input required type="tel" placeholder="Phone number" value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              className="px-3 py-2 border rounded-lg" />
            <input type="email" placeholder="Email (optional)" value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              className="px-3 py-2 border rounded-lg" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={createMember.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {createMember.isPending ? 'Adding...' : 'Add Member'}
          </button>
        </form>
      )}

      {createdPassword && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          Member created. Temporary password: <strong className="select-all">{createdPassword}</strong>.
          Share it privately; it is shown only once.
        </div>
      )}

      <div className="bg-white rounded-xl border p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : !customers?.data || customers.data.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No customers found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-600">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">KYC</th>
                <th className="px-4 py-3 font-medium">Groups</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.data.map((c: any) => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/customers/${c.id}`} className="text-blue-600 hover:underline font-medium">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.kycStatus === 'VERIFIED' ? 'bg-green-100 text-green-700'
                        : c.kycStatus === 'PENDING' || c.kycStatus === 'SUBMITTED' ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                    }`}>{c.kycStatus}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c._count?.memberships || 0}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(c.createdAt).toLocaleDateString('en-IN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
