'use client';

import { useAuth } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';

const navItems = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/products', label: 'Products', roles: ['SUPER_ADMIN', 'BRANCH_ADMIN'] },
  { href: '/admin/groups', label: 'Groups' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/audit', label: 'Activity Log', roles: ['SUPER_ADMIN'] },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
    if (!isLoading && user && user.role === 'CUSTOMER') router.push('/dashboard');
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/admin" className="text-xl font-bold text-blue-600">Stash Admin</Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:block">{user.name} ({user.role})</span>
            <button onClick={logout} className="text-sm text-red-500 hover:text-red-700">Logout</button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto -mb-px">
          {navItems.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                  isActive
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
