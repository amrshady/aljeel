import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import { parseInvoiceSubmitNotifyEmails } from './invoice-submit-notification.constants';
import {
  InvoiceSubmitNotificationService,
  type InvoiceSubmittedNotificationInput,
} from './invoice-submit-notification.service';

export interface SignatureTurnInput {
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  signerEmail: string;
  signerName: string;
}

export interface SignatureRejectedInput {
  invoiceId: string;
  invoiceNumber: string;
  reason: string;
  supplierEmails: string[];
}

@Injectable()
export class SignatureNotificationService {
  private readonly logger = new Logger(SignatureNotificationService.name);

  constructor(
    private readonly email: EmailService,
    private readonly submitNotification: InvoiceSubmitNotificationService,
  ) {}

  reviewerRecipients(): string[] {
    return parseInvoiceSubmitNotifyEmails(process.env.INVOICE_SUBMIT_NOTIFY_EMAILS);
  }

  buildUrl(path: string): string {
    const base = (
      process.env.WEB_APP_URL ??
      process.env.CORS_ORIGIN ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async notifyAwaitingSigner(input: SignatureTurnInput): Promise<void> {
    const signatureUrl = this.buildUrl(`/en/signatures/${input.invoiceId}`);
    const sends = [
      this.email.sendMail({
        to: [input.signerEmail],
        ...this.signerMessage(input, signatureUrl),
      }),
    ];

    const reviewers = this.reviewerRecipients().filter(
      (email) => email !== input.signerEmail.trim().toLowerCase(),
    );
    if (reviewers.length > 0) {
      const invoiceUrl = this.buildUrl(`/en/invoices/${input.invoiceId}`);
      sends.push(
        this.email.sendMail({
          to: reviewers,
          ...this.pendingMessage(input, invoiceUrl),
        }),
      );
    }

    const failed = (await Promise.allSettled(sends)).find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed) {
      throw failed.reason;
    }
  }

  async notifyReadyForReview(input: InvoiceSubmittedNotificationInput): Promise<void> {
    await this.submitNotification.notifyInvoiceSubmitted(input);
  }

  async notifyRejected(input: SignatureRejectedInput): Promise<void> {
    const recipients = [
      ...new Set(input.supplierEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
    ];
    if (recipients.length === 0) {
      this.logger.warn(
        { invoiceId: input.invoiceId },
        'Supplier rejection email skipped: no active supplier users',
      );
      return;
    }

    const invoiceUrl = this.buildUrl(`/en/invoices/${input.invoiceId}`);
    await this.email.sendMail({
      to: recipients,
      ...this.rejectedMessage(input, invoiceUrl),
    });
  }

  signerMessage(input: SignatureTurnInput, signatureUrl: string) {
    const subject = `Signature needed: ${input.invoiceNumber}`;
    const text = [
      'An Asateel batch is waiting for your signature.',
      '',
      `Supplier: ${input.supplierName}`,
      `Folder / invoice number: ${input.invoiceNumber}`,
      '',
      `Open in Aljeel AP Portal: ${signatureUrl}`,
    ].join('\n');
    const html = `
      <p>An Asateel batch is waiting for your signature.</p>
      <ul>
        <li><strong>Supplier:</strong> ${escapeHtml(input.supplierName)}</li>
        <li><strong>Folder / invoice number:</strong> ${escapeHtml(input.invoiceNumber)}</li>
      </ul>
      <p><a href="${escapeHtml(signatureUrl)}">Open in Aljeel AP Portal</a></p>
    `.trim();
    return { subject, text, html };
  }

  pendingMessage(input: SignatureTurnInput, invoiceUrl: string) {
    const subject = `Pending signature: ${input.invoiceNumber}`;
    const text = [
      'An Asateel batch is pending signature. It is not ready for review yet.',
      '',
      `Supplier: ${input.supplierName}`,
      `Folder / invoice number: ${input.invoiceNumber}`,
      `With: ${input.signerName}`,
      '',
      `Open in Aljeel AP Portal: ${invoiceUrl}`,
    ].join('\n');
    const html = `
      <p>An Asateel batch is pending signature. It is not ready for review yet.</p>
      <ul>
        <li><strong>Supplier:</strong> ${escapeHtml(input.supplierName)}</li>
        <li><strong>Folder / invoice number:</strong> ${escapeHtml(input.invoiceNumber)}</li>
        <li><strong>With:</strong> ${escapeHtml(input.signerName)}</li>
      </ul>
      <p><a href="${escapeHtml(invoiceUrl)}">Open in Aljeel AP Portal</a></p>
    `.trim();
    return { subject, text, html };
  }

  rejectedMessage(input: SignatureRejectedInput, invoiceUrl: string) {
    const subject = `Batch returned: ${input.invoiceNumber}`;
    const text = [
      'A signer returned this batch so it can be corrected and submitted again.',
      '',
      `Folder / invoice number: ${input.invoiceNumber}`,
      `Reason: ${input.reason}`,
      '',
      `Open in Aljeel AP Portal: ${invoiceUrl}`,
    ].join('\n');
    const html = `
      <p>A signer returned this batch so it can be corrected and submitted again.</p>
      <ul>
        <li><strong>Folder / invoice number:</strong> ${escapeHtml(input.invoiceNumber)}</li>
        <li><strong>Reason:</strong> ${escapeHtml(input.reason)}</li>
      </ul>
      <p><a href="${escapeHtml(invoiceUrl)}">Open in Aljeel AP Portal</a></p>
    `.trim();
    return { subject, text, html };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
