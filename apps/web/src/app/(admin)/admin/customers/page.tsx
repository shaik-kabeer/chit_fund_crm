'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

export default function AdminCustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [createdPhone, setCreatedPhone] = useState('');
  const [error, setError] = useState('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const limit = 20;
  const { data: customers, isLoading } = useQuery({
    queryKey: ['admin-customers', debouncedSearch, page],
    queryFn: () => api.get<any>(`/customers?search=${debouncedSearch}&page=${page}&limit=${limit}`),
  });

  const createMember = useMutation({
    mutationFn: () => api.post<any>('/customers', {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
    }),
    onSuccess: () => {
      setCreatedPhone(form.phone.trim());
      setForm({ name: '', phone: '', email: '' });
      setShowAdd(false);
      queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    },
    onError: (err: any) => setError(err.message || 'Could not add member'),
  });

  const meta = customers?.meta;
  const totalPages = meta?.totalPages || 1;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 mt-1">
            Manage all registered members
            {meta?.total ? <span className="ml-1 text-gray-400">({meta.total} total)</span> : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/export/customers"
            className="text-sm px-3 py-1 bg-gray-100 border rounded hover:bg-gray-200">
            Export CSV
          </a>
          <button onClick={() => { setShowAdd(!showAdd); setError(''); setCreatedPhone(''); }}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            {showAdd ? 'Cancel' : '+ Add Member'}
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={(event) => { event.preventDefault(); setError(''); createMember.mutate(); }}
          className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Add a member account</h2>
          <p className="text-xs text-gray-500">Only name and phone are required. Default password: <strong>phone@123</strong> — the member can change it after login.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <input required placeholder="Full name *" value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <input required type="tel" placeholder="Phone number *" value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              <p className="text-xs text-gray-400 mt-1">Min 10 digits · This becomes their login ID</p>
            </div>
            <div>
              <input type="email" placeholder="Email (optional)" value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={createMember.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700">
            {createMember.isPending ? 'Adding...' : 'Add Member'}
          </button>
        </form>
      )}

      {createdPhone && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
          <p className="font-medium">✓ Member added successfully!</p>
          <p className="mt-1">
            Default login: <strong>Phone: {createdPhone}</strong> · <strong>Password: {createdPhone}@123</strong>
          </p>
          <p className="mt-1 text-xs text-green-600">The member can change their password after logging in from the profile page.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search by name, phone, or email..."
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : !customers?.data || customers.data.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <div className="text-4xl mb-3">👥</div>
          <p className="text-gray-500">{debouncedSearch ? 'No customers match your search.' : 'No customers yet.'}</p>
          {!debouncedSearch && (
            <button onClick={() => setShowAdd(true)}
              className="mt-3 text-sm text-blue-600 hover:underline">+ Add your first member</button>
          )}
        </div>
      ) : (
        <>
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
                  <tr key={c.id} className="border-t hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <Link href={`/admin/customers/${c.id}`} className="text-blue-600 hover:underline font-medium">
                        {c.name}
                      </Link>
                      {!c.isActive && <span className="ml-2 text-xs text-red-500">(Inactive)</span>}
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-xl border px-4 py-3">
              <p className="text-sm text-gray-500">
                Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, meta?.total || 0)} of {meta?.total || 0}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-50">← Previous</button>
                <span className="px-3 py-1 text-sm text-gray-600">Page {page} / {totalPages}</span>
                <button onClick={() => setPage(page + 1)} disabled={page >= totalPages}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-50">Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
