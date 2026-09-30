'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { setInvoiceOracleEntered } from '@/lib/ap-api';
import { formatClientError } from '@/lib/format-error';

type OracleEnteredToggleProps = {
  invoiceId: string;
  batchName: string;
  oracleEnteredAt: string | null;
  variant?: 'compact' | 'panel';
};

function formatEnteredAt(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function SwitchTrack({ on, size }: { on: boolean; size: 'sm' | 'md' }) {
  const track = size === 'md' ? 'h-6 w-11' : 'h-5 w-9';
  const knob = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors ${track} ${
        on ? 'justify-end bg-emerald-600' : 'justify-start bg-[#D1D5DB]'
      }`}
    >
      <span className={`rounded-full bg-white shadow-sm ${knob}`} />
    </span>
  );
}

export function OracleEnteredToggle({
  invoiceId,
  batchName,
  oracleEnteredAt,
  variant = 'compact',
}: OracleEnteredToggleProps) {
  const t = useTranslations('apReview');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [entered, setEntered] = useState(oracleEnteredAt !== null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntered(oracleEnteredAt !== null);
  }, [oracleEnteredAt]);

  async function onToggle() {
    const next = !entered;
    setEntered(next);
    setPending(true);
    setError(null);
    try {
      await setInvoiceOracleEntered(invoiceId, next);
      await queryClient.invalidateQueries({ queryKey: ['ap', 'exceptions'] });
      await queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] });
    } catch (err) {
      setEntered(!next);
      setError(formatClientError(err, t('oracleError')));
    } finally {
      setPending(false);
    }
  }

  const status = entered
    ? oracleEnteredAt
      ? t('oracleEnteredOn', { when: formatEnteredAt(oracleEnteredAt, locale) })
      : t('oracleAdded')
    : t('oracleNotYet');

  if (variant === 'panel') {
    return (
      <div className="w-full sm:w-80">
        <button
          type="button"
          role="switch"
          aria-checked={entered}
          aria-label={`${t('oracleSwitchLabel')}: ${batchName}`}
          disabled={pending}
          onClick={() => void onToggle()}
          className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-start shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-70 ${
            entered
              ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-50/80'
              : 'border-[#E5E7EB] bg-card hover:bg-muted/40'
          }`}
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              entered
                ? 'bg-emerald-600 text-white'
                : 'border border-[#E5E7EB] bg-white text-[#D1D5DB]'
            }`}
          >
            <Check className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#0B1F3A]">
              {t('oracleSwitchLabel')}
            </span>
            <span
              className={`mt-0.5 block truncate text-xs ${
                entered ? 'text-emerald-800' : 'text-muted-foreground'
              }`}
            >
              {status}
            </span>
          </span>
          <SwitchTrack on={entered} size="md" />
        </button>
        {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={entered}
        aria-label={`${t('oracleSwitchLabel')}: ${batchName}`}
        disabled={pending}
        onClick={() => void onToggle()}
        className="inline-flex items-center gap-2 rounded-md text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
      >
        <SwitchTrack on={entered} size="sm" />
        <span className={entered ? 'text-emerald-800' : 'text-muted-foreground'}>
          {entered ? t('oracleAdded') : t('oracleNotAdded')}
        </span>
      </button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
