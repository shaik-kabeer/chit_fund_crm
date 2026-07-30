'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const EMPTY_KYC = {
  name: '', fatherName: '', dateOfBirth: '', pan: '', aadhaarLast4: '',
  address: '', city: '', state: '', pincode: '',
};
const EMPTY_BANK = {
  bankName: '', bankAccountNo: '', bankIfsc: '', bankBranch: '', upiId: '',
};

export default function KycPage() {
  const queryClient = useQueryClient();
  const [kyc, setKyc] = useState(EMPTY_KYC);
  const [bank, setBank] = useState(EMPTY_BANK);
  const [message, setMessage] = useState('');
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const { data: profile, isLoading } = useQuery({
    queryKey: ['customer-profile'],
    queryFn: () => api.get<any>('/customers/profile'),
  });

  useEffect(() => {
    if (!profile) return;
    setKyc({
      name: profile.name || '',
      fatherName: profile.fatherName || '',
      dateOfBirth: profile.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : '',
      pan: profile.pan || '',
      aadhaarLast4: profile.aadhaarLast4 || '',
      address: profile.address || '',
      city: profile.city || '',
      state: profile.state || '',
      pincode: profile.pincode || '',
    });
    setBank({
      bankName: profile.bankName || '',
      bankAccountNo: profile.bankAccountNo || '',
      bankIfsc: profile.bankIfsc || '',
      bankBranch: profile.bankBranch || '',
      upiId: profile.upiId || '',
    });
  }, [profile]);

  const submitKyc = useMutation({
    mutationFn: () => api.post('/customers/kyc/submit', kyc),
    onSuccess: () => {
      setMessage('KYC details submitted for admin review. You can keep using the app meanwhile.');
      queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
    },
  });

  const saveBank = useMutation({
    mutationFn: () => api.patch('/customers/bank-details', bank),
    onSuccess: () => {
      setMessage('Bank and payout details saved.');
      queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
    },
  });

  const changePassword = useMutation({
    mutationFn: () => {
      if (passwords.newPassword !== passwords.confirmPassword) {
        throw new Error('New passwords do not match');
      }
      return api.post<{ message: string }>('/auth/customer/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
    },
    onSuccess: () => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login?passwordChanged=1';
    },
  });

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading...</div>;
  const locked = profile?.kycStatus === 'SUBMITTED' || profile?.kycStatus === 'VERIFIED';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Profile & KYC</h1>
        <p className="mt-1 text-gray-500">
          All fields are optional. Fill what you have now and update later.
        </p>
      </div>

      <div className={`rounded-xl border p-4 text-sm ${
        profile?.kycStatus === 'VERIFIED' ? 'border-green-200 bg-green-50 text-green-800'
          : profile?.kycStatus === 'REJECTED' ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}>
        <strong>KYC status: {profile?.kycStatus}</strong>
        {profile?.kycSubmittedAt && <span> · Submitted {formatDate(profile.kycSubmittedAt)}</span>}
        {profile?.kycVerifiedAt && <span> · Verified {formatDate(profile.kycVerifiedAt)}</span>}
        {profile?.kycRejectionReason && (
          <p className="mt-2">Review note: <strong>{profile.kycRejectionReason}</strong>. Correct the details and submit again.</p>
        )}
      </div>

      {message && <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</div>}

      <form onSubmit={(event) => { event.preventDefault(); submitKyc.mutate(); }}
        className="rounded-xl border bg-white p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Identity details (optional)</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            ['name', 'Full name'], ['fatherName', 'Father / guardian name'],
            ['dateOfBirth', 'Date of birth', 'date'], ['pan', 'PAN'],
            ['aadhaarLast4', 'Last 4 digits of Aadhaar'], ['address', 'Address'],
            ['city', 'City'], ['state', 'State'], ['pincode', 'Pincode'],
          ].map(([key, label, type]) => (
            <label key={key} className={key === 'address' ? 'sm:col-span-2 text-sm' : 'text-sm'}>
              <span className="mb-1 block font-medium text-gray-700">{label}</span>
              <input disabled={locked} type={type || 'text'}
                value={(kyc as any)[key]}
                maxLength={key === 'aadhaarLast4' ? 4 : undefined}
                onChange={(event) => setKyc({ ...kyc, [key]: event.target.value })}
                className="w-full rounded-lg border px-3 py-2 disabled:bg-gray-100" />
            </label>
          ))}
        </div>
        {submitKyc.isError && <p className="text-sm text-red-600">{(submitKyc.error as any)?.message}</p>}
        {!locked && (
          <button disabled={submitKyc.isPending}
            className="rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50">
            {submitKyc.isPending ? 'Submitting...' : profile?.kycStatus === 'REJECTED' ? 'Resubmit KYC' : 'Submit KYC'}
          </button>
        )}
      </form>

      <form onSubmit={(event) => { event.preventDefault(); saveBank.mutate(); }}
        className="rounded-xl border bg-white p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">Bank and payout details (optional)</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            ['bankName', 'Bank name'], ['bankAccountNo', 'Account number'],
            ['bankIfsc', 'IFSC'], ['bankBranch', 'Branch'], ['upiId', 'UPI ID'],
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">{label}</span>
              <input value={(bank as any)[key]}
                onChange={(event) => setBank({ ...bank, [key]: event.target.value })}
                className="w-full rounded-lg border px-3 py-2" />
            </label>
          ))}
        </div>
        {saveBank.isError && <p className="text-sm text-red-600">{(saveBank.error as any)?.message}</p>}
        <button disabled={saveBank.isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50">
          {saveBank.isPending ? 'Saving...' : 'Save Bank Details'}
        </button>
      </form>

      <form
        onSubmit={(event) => { event.preventDefault(); changePassword.mutate(); }}
        className="rounded-xl border bg-white p-6 space-y-4"
      >
        <div>
          <h2 className="font-semibold text-gray-800">Change password</h2>
          <p className="mt-1 text-sm text-gray-500">
            After changing it, sign in again with the new password.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            ['currentPassword', 'Current password'],
            ['newPassword', 'New password'],
            ['confirmPassword', 'Confirm new password'],
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">{label}</span>
              <input
                type="password"
                required
                minLength={8}
                value={passwords[key as keyof typeof passwords]}
                onChange={(event) => setPasswords({ ...passwords, [key]: event.target.value })}
                className="w-full rounded-lg border px-3 py-2"
              />
            </label>
          ))}
        </div>
        {changePassword.isError && (
          <p className="text-sm text-red-600">{(changePassword.error as Error).message}</p>
        )}
        <button
          disabled={changePassword.isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-white disabled:opacity-50"
        >
          {changePassword.isPending ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}
