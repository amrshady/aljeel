'use client';

import { Button } from '@aljeel/ui';
import {
  InviteSupplierUserSchema,
  SupplierProfileSchema,
  SupplierUserSchema,
  UpdateSupplierProfileSchema,
} from '@aljeel/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FormEvent, useEffect, useState } from 'react';
import { z } from 'zod';
import { AppShell } from '@/components/app-shell';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import { apiFetch, ApiClientError } from '@/lib/api-client';

function ProfileContent() {
  const t = useTranslations('profile');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'SUPPLIER_ADMIN';

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', 'me'],
    queryFn: () => apiFetch('/suppliers/me', { schema: SupplierProfileSchema }),
    enabled: !!user?.supplierId,
  });

  const { data: users } = useQuery({
    queryKey: ['supplier', 'users'],
    queryFn: () => apiFetch('/suppliers/me/users', { schema: z.array(SupplierUserSchema) }),
    enabled: isAdmin,
  });

  const [legalName, setLegalName] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateProfile = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch('/suppliers/me', {
        method: 'PUT',
        body: JSON.stringify(body),
        schema: SupplierProfileSchema,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier'] });
      setMessage(t('saved'));
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('saveError'));
    },
  });

  const inviteUser = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch('/suppliers/me/users', {
        method: 'POST',
        body: JSON.stringify(body),
        schema: SupplierUserSchema,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier', 'users'] });
      setInviteEmail('');
      setInviteName('');
      setMessage(t('invited'));
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiClientError ? err.message : t('inviteError'));
    },
  });

  useEffect(() => {
    if (supplier) {
      setLegalName(supplier.legalName);
      setPaymentTerms(supplier.paymentTerms ?? '');
    }
  }, [supplier]);

  function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    const body = UpdateSupplierProfileSchema.parse({
      legalName: legalName || supplier?.legalName,
      paymentTerms: paymentTerms || supplier?.paymentTerms || undefined,
    });
    updateProfile.mutate(body);
  }

  function onInvite(e: FormEvent) {
    e.preventDefault();
    const body = InviteSupplierUserSchema.parse({
      email: inviteEmail,
      fullName: inviteName,
      role: 'SUPPLIER_USER',
    });
    inviteUser.mutate(body);
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t('user')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">{t('name')}</dt>
              <dd className="font-medium">{user?.fullName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('email')}</dt>
              <dd className="font-medium">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('role')}</dt>
              <dd className="font-medium">{user?.role}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t('company')}</h2>
          {isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">…</p>
          ) : supplier ? (
            isAdmin ? (
              <form onSubmit={onSaveProfile} className="mt-3 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('legalName')}</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('paymentTerms')}</label>
                  <input
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" disabled={updateProfile.isPending}>
                  {t('save')}
                </Button>
              </form>
            ) : (
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('legalName')}</dt>
                  <dd className="font-medium">{supplier.legalName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('status')}</dt>
                  <dd className="font-medium">{supplier.status}</dd>
                </div>
              </dl>
            )
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">{t('noCompany')}</p>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="mt-8 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t('team')}</h2>
          <ul className="mt-4 divide-y text-sm">
            {users?.map((member) => (
              <li key={member.id} className="flex justify-between py-2">
                <span>
                  {member.fullName} · {member.email}
                </span>
                <span className="text-muted-foreground">{member.role}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={onInvite} className="mt-6 grid gap-3 sm:grid-cols-2">
            <input
              className="rounded-md border px-3 py-2 text-sm"
              placeholder={t('inviteName')}
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              required
            />
            <input
              type="email"
              className="rounded-md border px-3 py-2 text-sm"
              placeholder={t('inviteEmail')}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
            />
            <Button type="submit" size="sm" disabled={inviteUser.isPending}>
              {t('invite')}
            </Button>
          </form>
        </div>
      )}

      {message && <p className="mt-4 text-sm text-emerald-600">{message}</p>}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </AppShell>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  );
}
