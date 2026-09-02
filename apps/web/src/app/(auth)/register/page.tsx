'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { customerRegisterSchema } from '@chitfund/shared';
import { z } from 'zod';
import { useAuth } from '@/lib/auth';

const registerFormSchema = customerRegisterSchema
  .extend({
    email: z
      .string()
      .optional()
      .refine((v) => !v || z.string().email().safeParse(v).success, {
        message: 'Enter a valid email',
      }),
    confirm: z.string().min(1, 'Confirm your password'),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

type RegisterForm = z.infer<typeof registerFormSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const registerAuth = useAuth((state) => state.register);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', phone: '', email: '', password: '', confirm: '' },
  });

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    setLoading(true);
    try {
      await registerAuth({
        name: data.name.trim(),
        phone: data.phone.trim(),
        email: data.email?.trim() || undefined,
        password: data.password,
      });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900">Create member account</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">Register using the phone number you will use to sign in.</p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Full name" error={errors.name?.message} {...register('name')} />
          <Field label="Phone number" type="tel" error={errors.phone?.message} {...register('phone')} />
          <Field
            label="Email (optional)"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Field label="Password" type="password" error={errors.password?.message} {...register('password')} />
          <Field
            label="Confirm password"
            type="password"
            error={errors.confirm?.message}
            {...register('confirm')}
          />

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Already registered? <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  type = 'text',
  error,
  ...inputProps
}: {
  label: string;
  type?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        type={type}
        className="w-full rounded-lg border px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
        {...inputProps}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </label>
  );
}
