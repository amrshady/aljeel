'use client';

import type { UserRole } from '@aljeel/shared-types';
import { useAuth } from '@/components/auth-provider';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';

interface RequireRoleProps {
  roles: UserRole[];
  children: ReactNode;
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const t = useTranslations('dashboard');

  useEffect(() => {
    if (!isLoading && user && !roles.includes(user.role)) {
      router.replace('/dashboard');
    }
  }, [isLoading, user, roles, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        {t('loading')}
      </div>
    );
  }

  if (!roles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
