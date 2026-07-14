import { ZodError } from 'zod';
import type {
  AsateelInvoiceManifestIssue,
  JawalEvidenceIssue,
} from '@aljeel/shared-types';
import { ApiClientError } from './api-client';

type InvoiceErrorTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function formatValidationFields(fields: unknown[]): string | null {
  const messages = fields
    .map((field) => {
      if (typeof field === 'object' && field !== null && 'message' in field) {
        const record = field as { path?: string; message: string };
        const path = record.path?.trim();
        const message = String(record.message).trim();
        if (!message) return null;
        return path ? `${path}: ${message}` : message;
      }
      return null;
    })
    .filter(Boolean) as string[];

  return messages.length > 0 ? messages.join(' · ') : null;
}

function formatJawalFindingSummary(details: Record<string, unknown> | undefined): string | null {
  const findings = details?.findings;
  if (!Array.isArray(findings) || findings.length === 0) return null;
  return findings
    .slice(0, 5)
    .map((finding) => {
      if (typeof finding === 'object' && finding !== null && 'message' in finding) {
        return String((finding as { message: string }).message);
      }
      return null;
    })
    .filter(Boolean)
    .join(' · ');
}

export function formatClientError(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) {
    const missingInvoiceNos = err.details?.missingInvoiceNos;
    if (Array.isArray(missingInvoiceNos) && missingInvoiceNos.length > 0) {
      return `Missing uploaded files for invoice numbers: ${missingInvoiceNos.join(', ')}.`;
    }

    const jawalSummary = formatJawalFindingSummary(err.details);
    if (jawalSummary && String(err.code).startsWith('JAWAL_')) {
      return jawalSummary;
    }

    const fields = err.details?.fields;
    if (Array.isArray(fields)) {
      const validationMessage = formatValidationFields(fields);
      if (validationMessage) {
        return validationMessage;
      }
    }

    return err.message;
  }
  if (err instanceof ZodError) {
    return err.errors
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join(' · ');
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

export function formatInvoiceError(
  err: unknown,
  t: InvoiceErrorTranslator,
  fallback: string,
): string {
  if (err instanceof ApiClientError) {
    const missingInvoiceNos = err.details?.missingInvoiceNos;
    if (
      err.code === 'ASATEEL_INVOICE_FILES_MISSING' ||
      (Array.isArray(missingInvoiceNos) && missingInvoiceNos.length > 0)
    ) {
      const numbers = Array.isArray(missingInvoiceNos)
        ? missingInvoiceNos.join(', ')
        : '';
      return t('errors.asateelFilesMissing', { numbers });
    }

    if (String(err.code).startsWith('JAWAL_')) {
      return formatJawalEvidenceIssue(
        {
          code: err.code as JawalEvidenceIssue['code'],
          message: err.message,
          details: err.details as JawalEvidenceIssue['details'],
        },
        t,
      );
    }

    switch (err.code) {
      case 'ASATEEL_INVOICE_TABLE_REQUIRED':
        return t('errors.asateelTableRequired');
      case 'ASATEEL_INVOICE_TABLE_EMPTY':
        return t('errors.asateelTableEmpty');
      case 'INVOICE_NUMBER_TAKEN':
      case 'INVOICE_DUPLICATE': {
        const name = String(err.details?.invoiceNumber ?? '').trim();
        return name
          ? t('errors.invoiceNumberTaken', { name })
          : t('errors.invoiceNumberTakenGeneric');
      }
      case 'XLSX_REQUIRED':
        return t('errors.xlsxRequired');
      case 'DOCUMENTS_REQUIRED':
        return t('errors.filesRequired');
      default:
        break;
    }
  }

  return formatClientError(err, fallback);
}

export function formatAsateelManifestIssue(
  issue: AsateelInvoiceManifestIssue,
  t: InvoiceErrorTranslator,
): string {
  switch (issue.code) {
    case 'ASATEEL_INVOICE_FILES_MISSING':
      return t('errors.asateelFilesMissing', {
        numbers: issue.details?.missingInvoiceNos?.join(', ') ?? '',
      });
    case 'ASATEEL_INVOICE_TABLE_REQUIRED':
      return t('errors.asateelTableRequired');
    case 'ASATEEL_INVOICE_TABLE_EMPTY':
      return t('errors.asateelTableEmpty');
    case 'ASATEEL_INVOICE_FILES_EXTRA':
      return t('errors.asateelFilesExtra', {
        files: issue.details?.extraFileNames?.join(', ') ?? '',
      });
    default:
      return issue.message;
  }
}

export function formatJawalEvidenceIssue(
  issue: JawalEvidenceIssue,
  t: InvoiceErrorTranslator,
): string {
  const findings = issue.details?.findings ?? [];
  if (findings.length > 0) {
    return findings
      .slice(0, 5)
      .map((finding) => finding.message)
      .join(' · ');
  }

  switch (issue.code) {
    case 'JAWAL_TABLE_REQUIRED':
      return t('errors.jawalTableRequired');
    case 'JAWAL_TABLE_EMPTY':
      return t('errors.jawalTableEmpty');
    case 'JAWAL_REF_MALFORMED':
      return t('errors.jawalRefMalformed', {
        refs: issue.details?.malformedRefs?.join(', ') ?? '',
      });
    case 'JAWAL_REF_DUPLICATE':
      return t('errors.jawalRefDuplicate', {
        refs: issue.details?.duplicateRefs?.join(', ') ?? '',
      });
    case 'JAWAL_FOLDER_MISMATCH':
      return t('errors.jawalFolderMismatch', {
        folders: issue.details?.missingFolders?.join(', ') ?? '',
      });
    case 'JAWAL_APPROVAL_MISSING':
      return t('errors.jawalApprovalMissing');
    case 'JAWAL_ORPHAN_FOLDER':
      return t('errors.jawalOrphanFolder', {
        folders: issue.details?.orphanFolders?.join(', ') ?? '',
      });
    default:
      return issue.message;
  }
}
