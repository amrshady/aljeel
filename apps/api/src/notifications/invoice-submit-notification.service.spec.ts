import { describe, expect, it } from 'vitest';
import { parseInvoiceSubmitNotifyEmails } from './invoice-submit-notification.constants';
import { InvoiceSubmitNotificationService } from './invoice-submit-notification.service';

describe('parseInvoiceSubmitNotifyEmails', () => {
  it('uses the default AP recipients when env is unset', () => {
    expect(parseInvoiceSubmitNotifyEmails(undefined)).toEqual([
      'mlabadi@aljeel.com',
      'amr@accordpartners.ai',
      'ahmed.samy@myregent.ai',
    ]);
  });

  it('parses a comma-separated override list', () => {
    expect(parseInvoiceSubmitNotifyEmails('one@example.com, two@example.com')).toEqual([
      'one@example.com',
      'two@example.com',
    ]);
  });

  it('returns an empty list when explicitly disabled', () => {
    expect(parseInvoiceSubmitNotifyEmails('')).toEqual([]);
  });
});

describe('InvoiceSubmitNotificationService', () => {
  const service = new InvoiceSubmitNotificationService({ sendMail: async () => undefined } as never);

  it('builds a review link from WEB_APP_URL', () => {
    const previous = process.env.WEB_APP_URL;
    process.env.WEB_APP_URL = 'https://ap-aljeel.accordpartners.ai';
    try {
      expect(service.buildReviewUrl('inv_123')).toBe(
        'https://ap-aljeel.accordpartners.ai/en/invoices/inv_123',
      );
    } finally {
      process.env.WEB_APP_URL = previous;
    }
  });

  it('includes supplier and invoice details in the email body', () => {
    const message = service.buildMessage({
      invoiceId: 'inv_123',
      invoiceNumber: 'اداره 8-2026',
      supplierName: 'Asateel Integrated Supplier LLC',
      submittedByEmail: 'amr+asateel@accordpartners.ai',
      submittedByName: 'Asateel Admin',
    });

    expect(message.subject).toContain('اداره 8-2026');
    expect(message.text).toContain('Asateel Integrated Supplier LLC');
    expect(message.text).toContain('amr+asateel@accordpartners.ai');
    expect(message.html).toContain('/en/invoices/inv_123');
  });
});
