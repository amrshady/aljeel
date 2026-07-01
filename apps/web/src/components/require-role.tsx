'use client';

import type { UserRole } from '@aljeel/shared-types';
import { useAuth } from '@/components/auth-provider';
import { PageLoading } from '@/components/loading-spinner';
import { useRouter } from '@/i18n/routing';
import { useEffect, type ReactNode } from 'react';

interface RequireRoleProps {
  roles: UserRole[];
  children: ReactNode;
}

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && user && !roles.includes(user.role)) {
      router.replace('/dashboard');
    }
  }, [isLoading, user, roles, router]);

  if (isLoading || !user) {
    return <PageLoading />;
  }

  if (!roles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
