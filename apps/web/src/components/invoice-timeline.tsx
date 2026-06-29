'use client';

import type { InvoiceTimelineEvent } from '@aljeel/shared-types';
import { useTranslations } from 'next-intl';

interface InvoiceTimelineProps {
  events: InvoiceTimelineEvent[];
}

function describeEvent(
  event: InvoiceTimelineEvent,
  t: ReturnType<typeof useTranslations>,
): string {
  const afterStatus =
    event.after && typeof event.after.status === 'string' ? event.after.status : null;
  const beforeStatus =
    event.before && typeof event.before.status === 'string' ? event.before.status : null;

  switch (event.action) {
    case 'CREATE':
      return t('create');
    case 'UPDATE':
      return t('update');
    case 'SUBMIT':
      return t('submit');
    case 'STATUS_CHANGE':
      return afterStatus
        ? t('statusChange', { status: t(`status.${afterStatus}`) })
        : t('statusChangeGeneric');
    case 'APPROVED':
      return t('approved');
    case 'REJECTED':
      return t('rejected');
    case 'HOLD':
      return t('hold');
    case 'RESUME':
      return t('resume');
    default:
      if (afterStatus && beforeStatus) {
        return t('statusChange', { status: t(`status.${afterStatus}`) });
      }
      return event.action;
  }
}

export function InvoiceTimeline({ events }: InvoiceTimelineProps) {
  const t = useTranslations('timeline');

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    <ol className="relative space-y-4 border-s border-muted ps-4">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -start-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
          <p className="text-sm font-medium">{describeEvent(event, t)}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(event.createdAt).toLocaleString()}
          </p>
        </li>
      ))}
    </ol>
  );
}
