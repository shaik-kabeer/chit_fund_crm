'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/lib/auth';
import Link from 'next/link';
import { Suspense } from 'react';

const loginSchema = z.object({
  phone: z.string().min(10, 'Enter a valid phone number'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginForm_() {
  const [type, setType] = useState<'staff' | 'customer'>('customer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuth((s) => s.login);
  const passwordChanged = searchParams.get('passwordChanged') === '1';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
  });

  const onSubmit = async (data: LoginForm) => {
    setError('');
    setLoading(true);
    try {
      await login(data.phone, data.password, type);
      router.push(type === 'staff' ? '/admin' : '/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Stash</h1>
          <p className="text-gray-500 mt-1">Chit Fund Management</p>
        </div>

        {passwordChanged && (
          <div className="bg-green-50 text-green-700 p-3 rounded-lg text-sm mb-4 text-center">
            ✓ Password changed successfully. Please log in with your new password.
          </div>
        )}

        <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setType('customer')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              type === 'customer' ? 'bg-white shadow text-blue-600' : 'text-gray-500'
            }`}
          >
            Member
          </button>
          <button
            type="button"
            onClick={() => setType('staff')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
              type === 'staff' ? 'bg-white shadow text-blue-600' : 'text-gray-500'
            }`}
          >
            Admin / Staff
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              autoComplete="tel"
              placeholder="9876543210"
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              {...register('phone')}
            />
            {errors.phone && (
              <p className="text-xs text-red-500 mt-1">{errors.phone.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter password"
                className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none pr-12"
                {...register('password')}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
            )}
            {type === 'customer' && (
              <p className="text-xs text-gray-400 mt-1">First time? Your default password is <strong>phone@123</strong></p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        {type === 'customer' && (
          <p className="mt-5 text-center text-sm text-gray-500">
            New member?{' '}
            <Link href="/register" className="font-medium text-blue-600 hover:underline">
              Create account
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>}>
      <LoginForm_ />
    </Suspense>
  );
}
