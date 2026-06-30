'use client';

import type { UserRole } from '@aljeel/shared-types';
import { Button } from '@aljeel/ui';
import { useTranslations } from 'next-intl';
import { AljeelLogo } from '@/components/aljeel-logo';
import { useAuth } from '@/components/auth-provider';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { SiteFooter } from '@/components/site-footer';
import { Link } from '@/i18n/routing';
import type { ReactNode } from 'react';

const AP_ROLES = new Set<UserRole>(['AP_CLERK', 'AP_APPROVER']);

export function AppShell({ children }: { children: ReactNode }) {
  const tDash = useTranslations('dashboard');
  const tApNav = useTranslations('apNav');
  const { user, logout } = useAuth();
  const isApUser = user && AP_ROLES.has(user.role);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b border-primary bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <AljeelLogo variant="light" className="h-10 w-auto" />
          </div>
          <div className="flex items-center gap-3">
            {isApUser && (
              <Link
                href="/ap/review"
                className="text-sm font-medium text-primary-foreground/90 underline-offset-4 hover:underline"
              >
                {tApNav('review')}
              </Link>
            )}
            <LocaleSwitcher className="border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" />
            <Button
              variant="outline"
              size="sm"
              className="border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={logout}
            >
              {tDash('logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>

      <SiteFooter />
    </div>
  );
}
