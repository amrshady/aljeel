'use client';

import type { ApReconciliationStatus } from '@aljeel/shared-types';
import { ASATEEL_REGION_CODES, AsateelRegionSchema } from '@aljeel/shared-types';
import { Button } from '@aljeel/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock3, Download, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { getApReconciliationStatus, rerunApReconciliation } from '@/lib/ap-api';
import { downloadFile } from '@/lib/api-client';
import { formatClientError } from '@/lib/format-error';

interface ReconciliationPanelProps {
  invoiceId: string;
  initialStatus?: ApReconciliationStatus | null;
}

const ACTIVE_STATUSES = new Set(['QUEUED', 'RUNNING']);

function badgeClass(status: ApReconciliationStatus['status'], emailSent: boolean | null) {
  if (status === 'DONE' && emailSent === false) {
    return 'border-amber-300 bg-amber-50 text-amber-800';
  }
  if (status === 'DONE') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  }
  if (status === 'FAILED' || status === 'STATUS_LOST') {
    return 'border-destructive/30 bg-destructive/10 text-destructive';
  }
  return 'border-[#2563EB]/30 bg-[#2563EB]/10 text-[#1E40AF]';
}

function StatusIcon({ status }: { status: ApReconciliationStatus['status'] }) {
  if (status === 'DONE') return <CheckCircle2 className="h-4 w-4" aria-hidden />;
  if (status === 'FAILED' || status === 'STATUS_LOST') {
    return <AlertCircle className="h-4 w-4" aria-hidden />;
  }
  return <Clock3 className="h-4 w-4" aria-hidden />;
}

export function ReconciliationPanel({ invoiceId, initialStatus }: ReconciliationPanelProps) {
  const t = useTranslations('reconciliation');
  const tRegion = useTranslations('invoiceForm.asateelRegions');
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: status = initialStatus ?? null } = useQuery({
    queryKey: ['ap', 'invoices', invoiceId, 'reconciliation'],
    queryFn: () => getApReconciliationStatus(invoiceId),
    initialData: initialStatus ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.status && ACTIVE_STATUSES.has(query.state.data.status)
        ? 45_000
        : false,
  });

  const rerunMutation = useMutation({
    mutationFn: () => rerunApReconciliation(invoiceId),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({
        queryKey: ['ap', 'invoices', invoiceId, 'reconciliation'],
      });
      await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
    },
    onError: (err) => setError(formatClientError(err, t('rerunError'))),
  });

  if (!status?.status) {
    return null;
  }

  const vendor = status.vendor ?? 'DEFAULT';
  const canDownload = status.status === 'DONE' && !!status.outputDocumentId;
  const canRerun = status.status === 'FAILED' || status.status === 'STATUS_LOST';
  const label =
    status.status === 'DONE' && status.emailSent === false
      ? t('status.DONE_EMAIL_FAILED')
      : t(`status.${status.status}`);
  const regionLabel = (() => {
    if (!status.region) return null;
    const parsed = AsateelRegionSchema.safeParse(status.region);
    if (!parsed.success) return status.region;
    return tRegion(parsed.data, { code: ASATEEL_REGION_CODES[parsed.data] });
  })();

  async function onDownload() {
    if (!status?.outputDocumentId) return;
    setError(null);
    try {
      await downloadFile(
        `/documents/${status.outputDocumentId}/download`,
        status.outputFileName ?? 'reconciliation-output.xlsx',
      );
    } catch (err) {
      setError(formatClientError(err, t('downloadError')));
    }
  }

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#1E40AF]">{t(`title.${vendor}`)}</h2>
          <div
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${badgeClass(
              status.status,
              status.emailSent,
            )}`}
          >
            <StatusIcon status={status.status} />
            <span>{label}</span>
          </div>
          {status.error && (
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{status.error}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {regionLabel && <span>{t('region', { region: regionLabel })}</span>}
            {status.queuePosition !== null && (
              <span>{t('queuePosition', { position: status.queuePosition })}</span>
            )}
            {status.lastPolledAt && (
              <span>
                {t('lastChecked', {
                  value: new Date(status.lastPolledAt).toLocaleTimeString(),
                })}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canDownload && (
            <Button type="button" onClick={onDownload} className="gap-2">
              <Download className="h-4 w-4" aria-hidden />
              {t(`download.${vendor}`)}
            </Button>
          )}
          {canRerun && (
            <Button
              type="button"
              variant="outline"
              disabled={rerunMutation.isPending}
              onClick={() => rerunMutation.mutate()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              {rerunMutation.isPending ? t('rerunning') : t('rerun')}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
