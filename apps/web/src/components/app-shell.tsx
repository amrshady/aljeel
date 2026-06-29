'use client';

import type { UserRole } from '@aljeel/shared-types';
import { Button, cn } from '@aljeel/ui';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/auth-provider';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link, usePathname } from '@/i18n/routing';
import type { ReactNode } from 'react';

const supplierNav = [
  { href: '/dashboard', key: 'dashboard' as const },
  { href: '/invoices', key: 'invoices' as const },
];

const apNav = [{ href: '/ap/review', key: 'review' as const }];

const AP_ROLES = new Set<UserRole>(['AP_CLERK', 'AP_APPROVER']);

export function AppShell({ children }: { children: ReactNode }) {
  const tDash = useTranslations('dashboard');
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const navItems = user && AP_ROLES.has(user.role) ? apNav : supplierNav;
  const tNav = useTranslations(AP_ROLES.has(user?.role ?? 'SUPPLIER_USER') ? 'apNav' : 'nav');

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image
              src="/aljeel-logo.jpeg"
              alt="Aljeel"
              width={96}
              height={38}
              className="h-8 w-auto object-contain"
            />
            <div>
              <p className="text-sm font-semibold leading-none">{tDash('portalName')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{user?.fullName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            <Button variant="outline" size="sm" onClick={logout}>
              {tDash('logout')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        <aside className="hidden w-48 shrink-0 md:block">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {tNav(item.key)}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
