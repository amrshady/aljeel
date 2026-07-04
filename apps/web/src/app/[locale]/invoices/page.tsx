'use client';

import { Button, cn } from '@aljeel/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { InvoiceListSection } from '@/components/invoice-list-section';
import { RequireAuth } from '@/components/require-auth';
import { Link } from '@/i18n/routing';

const FILTERS = [
  { labelKey: 'all', status: '' },
  { labelKey: 'unfinished', status: 'DRAFT' },
  { labelKey: 'underReview', status: 'UNDER_REVIEW' },
  { labelKey: 'approved', status: 'APPROVED' },
  { labelKey: 'rejected', status: 'REJECTED' },
] as const;

function filterChipClass(selected: boolean) {
  return cn(
    'inline-flex cursor-pointer items-center rounded-lg px-3 py-1.5 text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    selected
      ? 'bg-primary font-medium text-primary-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
  );
}

function InvoicesContent() {
  const t = useTranslations('invoices');
  const [status, setStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
          <Link href="/invoices/new">
            <Button>{t('newInvoice')}</Button>
          </Link>
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
          {FILTERS.map((filter) => {
            const selected = !showArchived && status === filter.status;
            return (
              <button
                key={filter.labelKey}
                type="button"
                onClick={() => {
                  setShowArchived(false);
                  setStatus(filter.status);
                }}
                className={filterChipClass(selected)}
              >
                {t(filter.labelKey)}
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
            {t('archived')}
          </button>
        </div>

        <InvoiceListSection
          status={status}
          showArchived={showArchived}
          onShowDrafts={() => {
            setShowArchived(false);
            setStatus('DRAFT');
          }}
        />
      </div>
    </AppShell>
  );
}

export default function InvoicesPage() {
  return (
    <RequireAuth>
      <InvoicesContent />
    </RequireAuth>
  );
}
