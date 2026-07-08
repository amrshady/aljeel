import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from './email.service';
import {
  DEFAULT_INVOICE_SUBMIT_NOTIFY_EMAILS,
  parseInvoiceSubmitNotifyEmails,
} from './invoice-submit-notification.constants';

export interface InvoiceSubmittedNotificationInput {
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  submittedByEmail: string;
  submittedByName: string;
}

@Injectable()
export class InvoiceSubmitNotificationService {
  private readonly logger = new Logger(InvoiceSubmitNotificationService.name);

  constructor(private readonly email: EmailService) {}

  getRecipients(): string[] {
    return parseInvoiceSubmitNotifyEmails(process.env.INVOICE_SUBMIT_NOTIFY_EMAILS);
  }

  buildReviewUrl(invoiceId: string): string {
    const base = (process.env.WEB_APP_URL ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    return `${base}/en/invoices/${invoiceId}`;
  }

  buildMessage(input: InvoiceSubmittedNotificationInput): {
    subject: string;
    text: string;
    html: string;
  } {
    const reviewUrl = this.buildReviewUrl(input.invoiceId);
    const subject = `Invoice submitted: ${input.invoiceNumber}`;
    const text = [
      'A supplier has submitted an invoice folder for review.',
      '',
      `Supplier: ${input.supplierName}`,
      `Folder / invoice number: ${input.invoiceNumber}`,
      `Submitted by: ${input.submittedByName} <${input.submittedByEmail}>`,
      '',
      `Open in Aljeel AP Portal: ${reviewUrl}`,
    ].join('\n');

    const html = `
      <p>A supplier has submitted an invoice folder for review.</p>
      <ul>
        <li><strong>Supplier:</strong> ${escapeHtml(input.supplierName)}</li>
        <li><strong>Folder / invoice number:</strong> ${escapeHtml(input.invoiceNumber)}</li>
        <li><strong>Submitted by:</strong> ${escapeHtml(input.submittedByName)} &lt;${escapeHtml(input.submittedByEmail)}&gt;</li>
      </ul>
      <p><a href="${escapeHtml(reviewUrl)}">Open in Aljeel AP Portal</a></p>
    `.trim();

    return { subject, text, html };
  }

  async notifyInvoiceSubmitted(input: InvoiceSubmittedNotificationInput): Promise<void> {
    const recipients = this.getRecipients();
    if (recipients.length === 0) {
      this.logger.warn('Invoice submit notification skipped: no recipients configured');
      return;
    }

    const message = this.buildMessage(input);
    await this.email.sendMail({
      to: recipients,
      ...message,
    });

    this.logger.log(
      {
        invoiceId: input.invoiceId,
        recipients,
        defaultRecipients: DEFAULT_INVOICE_SUBMIT_NOTIFY_EMAILS,
      },
      'Invoice submit notification sent',
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
