'use client';

import { ASATEEL_REGION_CODES, ASATEEL_REGION_VALUES } from '@aljeel/shared-types';
import { useTranslations } from 'next-intl';

export function AsateelAreaSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('invoiceForm');

  return (
    <div className="max-w-xs">
      <label className="text-sm font-medium" htmlFor={id}>
        {t('asateelRegion')}
        <span className="text-destructive"> *</span>
      </label>
      <select
        id={id}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={value}
        disabled={disabled}
        required
        aria-required="true"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('asateelRegionPlaceholder')}</option>
        {ASATEEL_REGION_VALUES.map((region) => (
          <option key={region} value={region}>
            {t(`asateelRegions.${region}`, {
              code: ASATEEL_REGION_CODES[region],
            })}
          </option>
        ))}
      </select>
    </div>
  );
}
