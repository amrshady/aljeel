'use client';

import { Button } from '@aljeel/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { InvoiceDocuments } from '@/components/invoice-documents';
import { InvoiceTimeline } from '@/components/invoice-timeline';
import { RequireAuth } from '@/components/require-auth';
import { RequireRole } from '@/components/require-role';
import { formatClientError } from '@/lib/format-error';
import {
  approveInvoice,
  getApInvoice,
  holdInvoice,
  listApExceptions,
  rejectInvoice,
  resumeInvoiceReview,
} from '@/lib/ap-api';

function ApReviewContent() {
  const t = useTranslations('apReview');
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const { data: queue, isLoading } = useQuery({
    queryKey: ['ap', 'exceptions'],
    queryFn: () => listApExceptions(),
  });

  const { data: selected } = useQuery({
    queryKey: ['ap', 'invoices', selectedId],
    queryFn: () => getApInvoice(selectedId!),
    enabled: !!selectedId,
  });

  async function runAction(action: () => Promise<unknown>) {
    setActing(true);
    setActionError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['ap'] });
      setReason('');
      setComment('');
      if (selectedId) {
        await queryClient.invalidateQueries({ queryKey: ['ap', 'invoices', selectedId] });
      }
    } catch (err) {
      setActionError(formatClientError(err, t('actionError')));
    } finally {
      setActing(false);
    }
  }

  const canAct = selected?.status === 'UNDER_REVIEW';
  const canResume = selected?.status === 'ON_HOLD';

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

      {isLoading && <p className="mt-6 text-muted-foreground">{t('loading')}</p>}

      {!isLoading && queue?.data.length === 0 && (
        <p className="mt-6 text-muted-foreground">{t('empty')}</p>
      )}

      {queue && queue.data.length > 0 && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-muted-foreground">
                  <th className="p-3 font-medium">{t('invoice')}</th>
                  <th className="p-3 font-medium">{t('supplier')}</th>
                  <th className="p-3 font-medium">{t('status')}</th>
                  <th className="p-3 font-medium">{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {queue.data.map((item) => (
                  <tr
                    key={item.id}
                    className={`cursor-pointer border-b last:border-0 hover:bg-muted/50 ${
                      selectedId === item.id ? 'bg-muted' : ''
                    }`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <td className="p-3 font-medium">{item.invoiceNumber}</td>
                    <td className="p-3">{item.supplierName}</td>
                    <td className="p-3">{t(`status.${item.status}`)}</td>
                    <td className="p-3">
                      {item.currency} {item.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            {!selectedId && (
              <p className="text-sm text-muted-foreground">{t('selectHint')}</p>
            )}
            {selected && (
              <div className="space-y-6">
                <div className="rounded-xl border bg-card p-6">
                  <h2 className="text-lg font-semibold">{selected.invoiceNumber}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.supplierName} · {t(`status.${selected.status}`)}
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {selected.currency} {selected.total}
                  </p>
                </div>

                <div className="rounded-xl border bg-card p-6">
                  <h3 className="font-semibold">{t('actions')}</h3>
                  {actionError && (
                    <p className="mt-2 text-sm text-destructive">{actionError}</p>
                  )}

                  {canAct && (
                    <div className="mt-4 space-y-4">
                      <Button
                        className="w-full"
                        disabled={acting}
                        onClick={() => runAction(() => approveInvoice(selected.id))}
                      >
                        {t('approve')}
                      </Button>
                      <div>
                        <label className="text-sm font-medium">{t('rejectReason')}</label>
                        <textarea
                          className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                          rows={2}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <Button
                          variant="outline"
                          className="mt-2 w-full border-destructive text-destructive hover:bg-destructive/10"
                          disabled={acting || !reason.trim()}
                          onClick={() =>
                            runAction(() => rejectInvoice(selected.id, reason.trim()))
                          }
                        >
                          {t('reject')}
                        </Button>
                      </div>
                      <div>
                        <label className="text-sm font-medium">{t('holdComment')}</label>
                        <textarea
                          className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                          rows={2}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                        <Button
                          variant="outline"
                          className="mt-2 w-full"
                          disabled={acting || !comment.trim()}
                          onClick={() =>
                            runAction(() => holdInvoice(selected.id, comment.trim()))
                          }
                        >
                          {t('hold')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {canResume && (
                    <Button
                      className="mt-4 w-full"
                      disabled={acting}
                      onClick={() => runAction(() => resumeInvoiceReview(selected.id))}
                    >
                      {t('resume')}
                    </Button>
                  )}

                  {selected.status === 'APPROVED' && (
                    <p className="mt-4 text-sm text-muted-foreground">{t('alreadyApproved')}</p>
                  )}
                </div>

                <InvoiceDocuments invoiceId={selected.id} editable={false} />

                <div className="rounded-xl border bg-card p-6">
                  <h3 className="font-semibold">{t('timeline')}</h3>
                  <div className="mt-4">
                    <InvoiceTimeline events={selected.timeline} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function ApReviewPage() {
  return (
    <RequireAuth>
      <RequireRole roles={['AP_CLERK', 'AP_APPROVER']}>
        <ApReviewContent />
      </RequireRole>
    </RequireAuth>
  );
}
