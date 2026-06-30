'use client';

import { Button } from '@aljeel/ui';
import { InvoicePipelineCountsSchema, SupplierProfileSchema } from '@aljeel/shared-types';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AppShell } from '@/components/app-shell';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { Link } from '@/i18n/routing';

const PIPELINE_STAGES = [
  { key: 'draft', color: 'bg-slate-100 text-slate-700' },
  { key: 'underReview', color: 'bg-amber-100 text-amber-800' },
  { key: 'onHold', color: 'bg-orange-100 text-orange-800' },
  { key: 'approved', color: 'bg-emerald-100 text-emerald-800' },
  { key: 'rejected', color: 'bg-red-100 text-red-800' },
] as const;

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('dashboard.status');
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    PENDING: 'bg-amber-100 text-amber-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    REJECTED: 'bg-red-100 text-red-800',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-muted text-muted-foreground'}`}
    >
      {t(status as 'ACTIVE')}
    </span>
  );
}

function DashboardContent() {
  const t = useTranslations('dashboard');
  const { user } = useAuth();

  const { data: supplier, isLoading: supplierLoading } = useQuery({
    queryKey: ['supplier', 'me'],
    queryFn: () =>
      apiFetch('/suppliers/me', {
        schema: z.union([SupplierProfileSchema, z.null()]),
      }),
    enabled: !!user?.supplierId,
  });

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ['invoices', 'summary'],
    queryFn: () => apiFetch('/invoices/summary', { schema: InvoicePipelineCountsSchema }),
    enabled: !!user?.supplierId,
  });

  const totalInvoices = pipeline
    ? Object.values(pipeline).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
          </div>
          <Link href="/invoices/new">
            <Button>{t('submitInvoice')}</Button>
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border bg-card p-5 shadow-sm sm:col-span-2 lg:col-span-1">
            <h2 className="text-sm font-medium text-muted-foreground">{t('company')}</h2>
            {supplierLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('loading')}</p>
            ) : supplier ? (
              <div className="mt-3 space-y-2">
                <p className="text-lg font-semibold">{supplier.legalName}</p>
                <div className="flex items-center gap-2">
                  <StatusBadge status={supplier.status} />
                  <span className="text-xs text-muted-foreground">{supplier.defaultCurrency}</span>
                </div>
                {supplier.crNumber && (
                  <p className="text-sm text-muted-foreground">
                    {t('cr')}: {supplier.crNumber}
                  </p>
                )}
                {supplier.vatNumber && (
                  <p className="text-sm text-muted-foreground">
                    {t('vat')}: {supplier.vatNumber}
                  </p>
                )}
                {supplier.paymentTerms && (
                  <p className="text-sm text-muted-foreground">
                    {t('paymentTerms')}: {supplier.paymentTerms}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{t('noSupplier')}</p>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-medium text-muted-foreground">{t('account')}</h2>
            <div className="mt-3 space-y-1">
              <p className="font-medium">{user?.fullName}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-sm">
                {t('role')}: <span className="font-medium">{user?.role}</span>
              </p>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-medium text-muted-foreground">{t('totalInvoices')}</h2>
            <p className="mt-3 text-3xl font-bold">
              {pipelineLoading ? '—' : totalInvoices}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t('allTime')}</p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">{t('pipeline')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('pipelineHint')}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {PIPELINE_STAGES.map((stage) => (
              <div
                key={stage.key}
                className="rounded-xl border bg-card p-4 text-center shadow-sm"
              >
                <p
                  className={`mx-auto inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${stage.color}`}
                >
                  {t(`stages.${stage.key}`)}
                </p>
                <p className="mt-3 text-2xl font-bold">
                  {pipelineLoading ? '—' : (pipeline?.[stage.key] ?? 0)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-dashed bg-card p-10 text-center">
          <h2 className="text-lg font-semibold">{t('emptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('emptyBody')}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/invoices/new">
              <Button>{t('submitInvoice')}</Button>
            </Link>
            <Link href="/invoices">
              <Button variant="outline">{t('viewInvoices')}</Button>
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
