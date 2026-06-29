'use client';

import { Button } from '@aljeel/ui';
import { useTranslations } from 'next-intl';
import { FormEvent, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { FileDropzone } from '@/components/file-dropzone';
import { RequireAuth } from '@/components/require-auth';
import { formatClientError } from '@/lib/format-error';
import {
  createInvoiceDraft,
  submitInvoice,
  uploadInvoiceDocument,
} from '@/lib/invoices-api';
import { useRouter } from '@/i18n/routing';
import { useQueryClient } from '@tanstack/react-query';

const PDF_ACCEPT = 'application/pdf,.pdf';

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'application/pdf' || name.endsWith('.pdf');
}

function InvoiceUploadContent() {
  const t = useTranslations('invoiceForm');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [invoicePdf, setInvoicePdf] = useState<File[]>([]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validateForm(requireInvoicePdf: boolean): string | null {
    if (requireInvoicePdf && invoicePdf.length === 0) {
      return t('errors.invoicePdfRequired');
    }
    if (invoicePdf.length > 0 && !isPdfFile(invoicePdf[0]!)) {
      return t('errors.invoicePdfType');
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
      const invoice = await createInvoiceDraft();
      if (invoicePdf[0]) {
        await uploadInvoiceDocument(invoice.id, invoicePdf[0], 'INVOICE');
      }
      for (const file of attachments) {
        await uploadInvoiceDocument(invoice.id, file, 'OTHER');
      }
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

  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>

        <form className="mt-8 space-y-8">
          <div>
            <h2 className="font-semibold">{t('invoicePdfTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('invoicePdfHint')}</p>
            <div className="mt-3">
              <FileDropzone
                files={invoicePdf}
                onChange={setInvoicePdf}
                disabled={loading}
                multiple={false}
                single
                accept={PDF_ACCEPT}
                title={t('invoicePdfDropTitle')}
                hint={t('invoicePdfDropHint')}
              />
            </div>
          </div>

          <div>
            <h2 className="font-semibold">{t('attachmentsTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('attachmentsHint')}</p>
            <div className="mt-3">
              <FileDropzone
                files={attachments}
                onChange={setAttachments}
                disabled={loading}
                title={t('attachmentsDropTitle')}
                hint={t('attachmentsDropHint')}
              />
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
      <InvoiceUploadContent />
    </RequireAuth>
  );
}
