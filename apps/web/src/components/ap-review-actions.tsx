'use client';

import { Button } from '@aljeel/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatClientError } from '@/lib/format-error';
import {
  approveInvoice,
  holdInvoice,
  rejectInvoice,
  resumeInvoiceReview,
} from '@/lib/ap-api';

type ApReviewActionsProps = {
  invoiceId: string;
  status: string;
};

export function ApReviewActions({ invoiceId, status }: ApReviewActionsProps) {
  const t = useTranslations('apReview');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const canAct = status === 'UNDER_REVIEW';
  const canResume = status === 'ON_HOLD';

  if (!canAct && !canResume && status !== 'APPROVED') {
    return null;
  }

  async function runAction(action: () => Promise<unknown>) {
    setActing(true);
    setActionError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['ap'] });
      await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      setReason('');
      setComment('');
    } catch (err) {
      setActionError(formatClientError(err, t('actionError')));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{t('actions')}</h2>
      {actionError && <p className="mt-2 text-sm text-destructive">{actionError}</p>}

      {canAct && (
        <div className="mt-4 space-y-4">
          <Button
            className="w-full sm:w-auto"
            disabled={acting}
            onClick={() => runAction(() => approveInvoice(invoiceId))}
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
              className="mt-2 w-full border-destructive text-destructive hover:bg-destructive/10 sm:w-auto"
              disabled={acting || !reason.trim()}
              onClick={() => runAction(() => rejectInvoice(invoiceId, reason.trim()))}
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
              className="mt-2 w-full sm:w-auto"
              disabled={acting || !comment.trim()}
              onClick={() => runAction(() => holdInvoice(invoiceId, comment.trim()))}
            >
              {t('hold')}
            </Button>
          </div>
        </div>
      )}

      {canResume && (
        <Button
          className="mt-4 w-full sm:w-auto"
          disabled={acting}
          onClick={() => runAction(() => resumeInvoiceReview(invoiceId))}
        >
          {t('resume')}
        </Button>
      )}

      {status === 'APPROVED' && (
        <p className="mt-4 text-sm text-muted-foreground">{t('alreadyApproved')}</p>
      )}
    </div>
  );
}
