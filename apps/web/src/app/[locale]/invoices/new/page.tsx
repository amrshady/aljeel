'use client';

import { Button } from '@aljeel/ui';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import type { InvoiceLineInput } from '@aljeel/shared-types';
import { AppShell } from '@/components/app-shell';
import { FileDropzone } from '@/components/file-dropzone';
import { RequireAuth } from '@/components/require-auth';
import { formatClientError } from '@/lib/format-error';
import {
  createInvoiceDraft,
  submitInvoice,
  uploadInvoiceDocument,
} from '@/lib/invoices-api';
import { listOpenPurchaseOrders } from '@/lib/purchase-orders-api';
import { useRouter } from '@/i18n/routing';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const emptyLine = (): InvoiceLineInput => ({
  description: '',
  qty: '1',
  unitPrice: '0',
  vatRate: '15',
});

function InvoiceFormContent() {
  const t = useTranslations('invoiceForm');
  const td = useTranslations('documents');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('SAR');
  const [poId, setPoId] = useState<string>('');
  const [lines, setLines] = useState<InvoiceLineInput[]>([emptyLine()]);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: openPos } = useQuery({
    queryKey: ['purchase-orders', 'open'],
    queryFn: listOpenPurchaseOrders,
  });

  async function uploadAttachments(invoiceId: string) {
    for (const file of files) {
      await uploadInvoiceDocument(invoiceId, file);
    }
  }

  function validateForm(requireFile: boolean): string | null {
    if (!invoiceNumber.trim()) {
      return t('errors.invoiceNumber');
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line?.description.trim()) {
        return t('errors.lineDescription', { line: i + 1 });
      }
      if (Number(line.qty) <= 0) {
        return t('errors.lineQty', { line: i + 1 });
      }
      if (Number(line.unitPrice) <= 0) {
        return t('errors.linePrice', { line: i + 1 });
      }
    }
    if (requireFile && files.length === 0) {
      return t('errors.fileRequired');
    }
    return null;
  }

  async function persistInvoice(submitAfter: boolean) {
    const validationError = validateForm(submitAfter);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const invoice = await createInvoiceDraft({
        invoiceNumber: invoiceNumber.trim(),
        invoiceDate,
        currency,
        poId: poId || null,
        lines: lines.map((line) => ({
          ...line,
          description: line.description.trim(),
        })),
      });
      await uploadAttachments(invoice.id);
      if (submitAfter) {
        await submitInvoice(invoice.id);
      }
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      router.push(submitAfter ? '/invoices' : `/invoices/${invoice.id}`);
    } catch (err) {
      setError(formatClientError(err, t('error')));
    } finally {
      setLoading(false);
    }
  }

  async function onSaveDraft(e: FormEvent) {
    e.preventDefault();
    await persistInvoice(false);
  }

  async function onSaveAndSubmit(e: FormEvent) {
    e.preventDefault();
    await persistInvoice(true);
  }

  function updateLine(index: number, patch: Partial<InvoiceLineInput>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

        <form className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium">{t('invoiceNumber')}</label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('invoiceDate')}</label>
              <input
                type="date"
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="w-32">
            <label className="text-sm font-medium">{t('currency')}</label>
            <input
              className="mt-1 w-full rounded-md border px-3 py-2"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">{t('poLink')}</label>
            <select
              className="mt-1 w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
              value={poId}
              onChange={(e) => setPoId(e.target.value)}
            >
              <option value="">{t('poNone')}</option>
              {openPos?.data.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} ({po.currency})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">{t('poHint')}</p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('lines')}</h2>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                {t('addLine')}
              </Button>
            </div>
            <div className="mt-3 space-y-4">
              {lines.map((line, index) => (
                <div key={index} className="rounded-lg border bg-card p-4 grid gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-4">
                    <label className="text-xs text-muted-foreground">{t('description')}</label>
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      value={line.description}
                      onChange={(e) => updateLine(index, { description: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t('qty')}</label>
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      value={line.qty}
                      onChange={(e) => updateLine(index, { qty: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t('unitPrice')}</label>
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t('vatRate')}</label>
                    <input
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      value={line.vatRate}
                      onChange={(e) => updateLine(index, { vatRate: e.target.value })}
                      required
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-semibold">{td('formTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{td('formHint')}</p>
            <div className="mt-3">
              <FileDropzone files={files} onChange={setFiles} disabled={loading} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={loading} onClick={onSaveDraft}>
              {loading ? t('saving') : t('saveDraft')}
            </Button>
            <Button type="button" disabled={loading} onClick={onSaveAndSubmit}>
              {loading ? t('submitting') : t('submit')}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

export default function NewInvoicePage() {
  return (
    <RequireAuth>
      <InvoiceFormContent />
    </RequireAuth>
  );
}
