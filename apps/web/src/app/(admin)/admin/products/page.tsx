'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useState } from 'react';

type Step = 'basics' | 'payouts' | null;

export default function AdminProductsPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(null);
  const [form, setForm] = useState({
    name: '', description: '', chitValueRupees: '', memberCount: '',
    baseInstallmentRupees: '', liftedInstallmentRupees: '',
  });
  const [monthlyPayouts, setMonthlyPayouts] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editPayouts, setEditPayouts] = useState<string[]>([]);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get<any[]>('/products?includeInactive=true'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      resetAll();
    },
    onError: (err: any) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.patch(`/products/${editing.id}`, {
      name: editing.name.trim(),
      description: editing.description?.trim() || '',
      baseInstallmentPaise: Math.round(Number(editing.baseInstallmentRupees) * 100),
      liftedInstallmentPaise: Math.round(Number(editing.liftedInstallmentRupees) * 100),
      monthlyPayouts: editPayouts.map((amount, index) => ({
        monthNumber: index + 1,
        payoutAmountPaise: Math.round(Number(amount) * 100),
      })),
    }),
    onSuccess: () => {
      setEditing(null);
      setEditPayouts([]);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => setError(err.message || 'Could not update product'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/products/${id}/toggle`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const resetAll = () => {
    setStep(null);
    setForm({ name: '', description: '', chitValueRupees: '', memberCount: '',
      baseInstallmentRupees: '', liftedInstallmentRupees: '' });
    setMonthlyPayouts([]);
    setError('');
  };

  const goToPayouts = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const months = parseInt(form.memberCount);
    if (!months || months < 1) {
      setError('Enter a valid number of months / members');
      return;
    }
    const chit = parseFloat(form.chitValueRupees);
    if (!chit || chit <= 0) {
      setError('Enter a valid chit value');
      return;
    }
    // Prefill each month with chit value as default (admin can edit)
    setMonthlyPayouts(Array.from({ length: months }, () => String(chit)));
    setStep('payouts');
  };

  const fillAll = (value: string) => {
    setMonthlyPayouts(monthlyPayouts.map(() => value));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const tenure = parseInt(form.memberCount);
    const chitValuePaise = Math.round(parseFloat(form.chitValueRupees) * 100);
    const baseInstallmentPaise = form.baseInstallmentRupees
      ? Math.round(parseFloat(form.baseInstallmentRupees) * 100)
      : Math.floor(chitValuePaise / tenure);
    const liftedInstallmentPaise = form.liftedInstallmentRupees
      ? Math.round(parseFloat(form.liftedInstallmentRupees) * 100)
      : baseInstallmentPaise;

    const schedule = monthlyPayouts.map((rupees, i) => ({
      monthNumber: i + 1,
      payoutAmountPaise: Math.round(parseFloat(rupees || '0') * 100),
    }));

    if (schedule.some((s) => !s.payoutAmountPaise || s.payoutAmountPaise <= 0)) {
      setError('Every month must have a positive payout amount');
      return;
    }

    createMutation.mutate({
      name: form.name,
      description: form.description || undefined,
      chitValuePaise,
      memberCount: tenure,
      tenureMonths: tenure,
      baseInstallmentPaise,
      liftedInstallmentPaise,
      monthlyPayouts: schedule,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500 mt-1">Design chit schemes with month-wise payouts</p>
        </div>
        <button
          onClick={() => { if (step) resetAll(); else setStep('basics'); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          {step ? 'Cancel' : '+ New Product'}
        </button>
      </div>

      {step === 'basics' && (
        <form onSubmit={goToPayouts} className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
            Basics — then design monthly payouts
          </div>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input type="text" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chit Value (₹) *</label>
              <input type="number" required value={form.chitValueRupees}
                onChange={(e) => setForm({ ...form, chitValueRupees: e.target.value })}
                placeholder="e.g. 100000" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Months / Members *</label>
              <input type="number" required min={1} value={form.memberCount}
                onChange={(e) => setForm({ ...form, memberCount: e.target.value })}
                placeholder="e.g. 20" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              <p className="text-xs text-gray-400 mt-1">Tenure months = member count (one lift per month)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input type="text" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly EMI — Not Lifted (₹)</label>
              <input type="number" value={form.baseInstallmentRupees}
                onChange={(e) => setForm({ ...form, baseInstallmentRupees: e.target.value })}
                placeholder="Auto: chit ÷ months"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly EMI — After Lift (₹)</label>
              <input type="number" value={form.liftedInstallmentRupees}
                onChange={(e) => setForm({ ...form, liftedInstallmentRupees: e.target.value })}
                placeholder="Same as non-lifted if blank"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Next: Design Monthly Payouts →
          </button>
        </form>
      )}

      {step === 'payouts' && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
            Payout if member lifts in each month — {form.name} ({form.memberCount} months)
          </div>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}

          <div className="flex flex-wrap items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-600">Fill all months with:</span>
            <input type="number" id="fill-all" placeholder="Amount ₹"
              className="px-3 py-1.5 border rounded-lg text-sm w-36 outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  fillAll((e.target as HTMLInputElement).value);
                }
              }}
            />
            <button type="button"
              onClick={() => {
                const el = document.getElementById('fill-all') as HTMLInputElement;
                if (el?.value) fillAll(el.value);
              }}
              className="px-3 py-1.5 border text-sm rounded-lg hover:bg-white">
              Apply to all
            </button>
            <button type="button"
              onClick={() => fillAll(form.chitValueRupees)}
              className="px-3 py-1.5 border text-sm rounded-lg hover:bg-white">
              Use chit value
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 max-h-96 overflow-y-auto">
            {monthlyPayouts.map((val, i) => (
              <div key={i} className="border rounded-lg p-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Month {i + 1}</label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    required
                    value={val}
                    onChange={(e) => {
                      const next = [...monthlyPayouts];
                      next[i] = e.target.value;
                      setMonthlyPayouts(next);
                    }}
                    className="w-full pl-6 pr-2 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setStep('basics')}
              className="px-5 py-2 border rounded-lg hover:bg-gray-50">← Back</button>
            <button type="submit" disabled={createMutation.isPending}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {createMutation.isPending ? 'Creating...' : 'Create Product'}
            </button>
          </div>
        </form>
      )}

      {editing && (
        <form onSubmit={(event) => { event.preventDefault(); updateMutation.mutate(); }}
          className="bg-white rounded-xl border border-blue-200 p-6 space-y-4">
          <div className="flex justify-between">
            <h2 className="font-semibold text-gray-900">Edit {editing.name}</h2>
            <button type="button" onClick={() => setEditing(null)} className="text-sm text-gray-500">Cancel</button>
          </div>
          {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">Name
              <input required value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                className="mt-1 w-full px-3 py-2 border rounded-lg" />
            </label>
            <label className="text-sm">Description
              <input value={editing.description || ''}
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                className="mt-1 w-full px-3 py-2 border rounded-lg" />
            </label>
            <label className="text-sm">EMI — not lifted (₹)
              <input required type="number" value={editing.baseInstallmentRupees}
                onChange={(event) => setEditing({ ...editing, baseInstallmentRupees: event.target.value })}
                className="mt-1 w-full px-3 py-2 border rounded-lg" />
            </label>
            <label className="text-sm">EMI — after lift (₹)
              <input required type="number" value={editing.liftedInstallmentRupees}
                onChange={(event) => setEditing({ ...editing, liftedInstallmentRupees: event.target.value })}
                className="mt-1 w-full px-3 py-2 border rounded-lg" />
            </label>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Monthly payout schedule</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
              {editPayouts.map((value, index) => (
                <label key={index} className="text-xs text-gray-500">Month {index + 1}
                  <input required type="number" value={value}
                    onChange={(event) => {
                      const next = [...editPayouts];
                      next[index] = event.target.value;
                      setEditPayouts(next);
                    }}
                    className="mt-1 w-full px-2 py-1.5 border rounded" />
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Financial fields are locked while a group is open or active.</p>
          </div>
          <button disabled={updateMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {updateMutation.isPending ? 'Saving...' : 'Save Product'}
          </button>
        </form>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : !products || products.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No products yet. Create your first chit scheme.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {products.map((p: any) => (
            <div key={p.id} className="bg-white rounded-xl border p-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-gray-900">{p.name}</h3>
                  {p.description && <p className="text-sm text-gray-500 mt-1">{p.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    setEditing({
                      ...p,
                      baseInstallmentRupees: String(Number(p.baseInstallmentPaise) / 100),
                      liftedInstallmentRupees: String(Number(p.liftedInstallmentPaise) / 100),
                    });
                    setEditPayouts((p.payoutSchedule || []).map((entry: any) =>
                      String(Number(entry.payoutAmountPaise) / 100)));
                    setError('');
                  }} className="text-xs px-2 py-1 border rounded">Edit</button>
                  <button onClick={() => toggleMutation.mutate(p.id)}
                    className={`text-xs px-2 py-1 rounded-full ${
                      p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>{p.isActive ? 'Active' : 'Inactive'}</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 text-sm">
                <div><span className="text-gray-500">Chit Value</span><p className="font-medium">{formatCurrency(p.chitValuePaise)}</p></div>
                <div><span className="text-gray-500">Months</span><p className="font-medium">{p.tenureMonths}</p></div>
                <div><span className="text-gray-500">EMI (Not Lifted)</span><p className="font-medium">{formatCurrency(p.baseInstallmentPaise)}</p></div>
                <div><span className="text-gray-500">EMI (Lifted)</span><p className="font-medium">{formatCurrency(p.liftedInstallmentPaise)}</p></div>
                <div><span className="text-gray-500">Payout Schedule</span>
                  <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    className="font-medium text-blue-600 hover:underline text-left">
                    {p.payoutSchedule?.length || 0} months — view
                  </button>
                </div>
              </div>
              {expandedId === p.id && p.payoutSchedule?.length > 0 && (
                <div className="mt-4 pt-4 border-t grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                  {p.payoutSchedule.map((s: any) => (
                    <div key={s.monthNumber} className="bg-gray-50 rounded px-2 py-1.5">
                      <span className="text-gray-500">M{s.monthNumber}</span>
                      <p className="font-medium">{formatCurrency(s.payoutAmountPaise)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
