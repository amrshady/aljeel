'use client';

import { useRouter } from '@/i18n/routing';
import { useEffect } from 'react';

export default function InvoicesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}
