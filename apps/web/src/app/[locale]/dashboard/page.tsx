'use client';

import { Button, cn } from '@aljeel/ui';
import { InvoicePipelineCountsSchema, SupplierProfileSchema } from '@aljeel/shared-types';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { InvoiceListSection } from '@/components/invoice-list-section';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/lib/api-client';
import { Link } from '@/i18n/routing';

const PIPELINE_STAGES = [
  { key: 'draft', status: 'DRAFT' },
  { key: 'underReview', status: 'UNDER_REVIEW' },
  { key: 'onHold', status: 'ON_HOLD' },
  { key: 'approved', status: 'APPROVED' },
  { key: 'rejected', status: 'REJECTED' },
] as const;

function filterChipClass(selected: boolean) {
  return cn(
    'inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    selected
      ? 'bg-primary font-medium text-primary-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
  );
}

function DashboardContent() {
  const t = useTranslations('dashboard');
  const tInvoices = useTranslations('invoices');
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);

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

  const showEmpty = !pipelineLoading && totalInvoices === 0;
  const isAllSelected = !showArchived && status === '';

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('portalName')}</h1>
            {supplierLoading ? (
              <p className="mt-1 text-sm text-muted-foreground">{t('loading')}</p>
            ) : supplier ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {supplier.legalName}
                {supplier.crNumber ? ` · ${t('cr')}: ${supplier.crNumber}` : ''}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
            )}
          </div>
          <Link href="/invoices/new">
            <Button>{t('submitInvoice')}</Button>
          </Link>
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => {
              setShowArchived(false);
              setStatus('');
            }}
            className={filterChipClass(isAllSelected)}
          >
            <span>{tInvoices('all')}</span>
            <span className="tabular-nums font-semibold">
              {pipelineLoading ? '—' : totalInvoices}
            </span>
          </button>
          {PIPELINE_STAGES.map((stage) => {
            const selected = !showArchived && status === stage.status;

            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => {
                  setShowArchived(false);
                  setStatus(stage.status);
                }}
                className={filterChipClass(selected)}
              >
                <span>{t(`stages.${stage.key}`)}</span>
                <span className="tabular-nums font-semibold">
                  {pipelineLoading ? '—' : (pipeline?.[stage.key] ?? 0)}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setShowArchived(true);
              setStatus('');
            }}
            className={filterChipClass(showArchived)}
          >
            <span>{tInvoices('archived')}</span>
          </button>
        </div>

        {showEmpty ? (
          <section className="rounded-xl border border-dashed bg-card p-10 text-center">
            <h2 className="text-lg font-semibold">{t('emptyTitle')}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t('emptyBody')}</p>
            <div className="mt-6 flex justify-center">
              <Link href="/invoices/new">
                <Button>{t('submitInvoice')}</Button>
              </Link>
            </div>
          </section>
        ) : (
          <InvoiceListSection
            status={status}
            showArchived={showArchived}
            onShowDrafts={() => {
              setShowArchived(false);
              setStatus('DRAFT');
            }}
          />
        )}
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
