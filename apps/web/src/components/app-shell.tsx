'use client';

import type { UserRole } from '@aljeel/shared-types';
import { Button, cn } from '@aljeel/ui';
import { useTranslations } from 'next-intl';
import { AljeelLogo } from '@/components/aljeel-logo';
import { useAuth } from '@/components/auth-provider';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { SiteFooter } from '@/components/site-footer';
import { Link, usePathname } from '@/i18n/routing';
import type { ReactNode } from 'react';

const PRIVILEGED_AP_ROLES = new Set<UserRole>(['AP_CLERK', 'AP_APPROVER']);

const headerButtonClass =
  'h-9 rounded-full border-white/20 bg-white/[0.06] px-4 text-white/90 hover:border-white/35 hover:bg-white/[0.14] hover:text-white';

function navLinkClass(active: boolean) {
  return cn(
    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
    active ? 'bg-white/[0.14] text-white' : 'text-white/75 hover:bg-white/[0.08] hover:text-white',
  );
}

function NavDot({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span
      className="size-1.5 rounded-full bg-pimento shadow-[0_0_8px_rgba(222,94,76,0.9)]"
      aria-hidden="true"
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const tDash = useTranslations('dashboard');
  const tApNav = useTranslations('apNav');
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isPrivilegedApUser = user && PRIVILEGED_AP_ROLES.has(user.role);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="header-surface text-primary-foreground">
        <div className="relative z-10 mx-auto flex max-w-[90rem] items-center justify-between gap-6 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="cursor-pointer">
              <AljeelLogo variant="light" className="h-14 w-auto" />
            </Link>
          </div>
          <div className="flex items-center gap-2">
            {isPrivilegedApUser && (
              <>
                <nav className="flex items-center gap-1">
                  <Link href="/ap/review" className={navLinkClass(pathname.startsWith('/ap/review'))}>
                    <NavDot active={pathname.startsWith('/ap/review')} />
                    {tApNav('review')}
                  </Link>
                  <Link
                    href="/ap/pt-mappings"
                    className={navLinkClass(pathname.startsWith('/ap/pt-mappings'))}
                  >
                    <NavDot active={pathname.startsWith('/ap/pt-mappings')} />
                    {tApNav('ptMappings')}
                  </Link>
                </nav>
                <span className="mx-3 h-6 w-px bg-white/20" aria-hidden="true" />
              </>
            )}
            <LocaleSwitcher className={headerButtonClass} />
            <Button
              variant="outline"
              size="sm"
              className={cn(headerButtonClass, 'hover:border-pimento hover:bg-pimento hover:text-white')}
              onClick={logout}
            >
              {tDash('logout')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-8 sm:px-6">{children}</main>

      <SiteFooter />
    </div>
  );
}
