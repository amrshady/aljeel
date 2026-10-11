import { describe, expect, it, vi } from 'vitest';
import { SignatureNotificationService } from './signature-notification.service';

const turn = {
  invoiceId: 'inv_123',
  invoiceNumber: 'SIG-MOCK-12',
  supplierName: 'Asateel Integrated Supplier LLC',
  signerEmail: 'wkobessy@aljeel.com',
  signerName: 'Waleed Kobessy',
};

describe('SignatureNotificationService', () => {
  it('emails the signer a signature link and Labadi a pending-signature link', async () => {
    const previous = process.env.WEB_APP_URL;
    const previousRecipients = process.env.INVOICE_SUBMIT_NOTIFY_EMAILS;
    process.env.WEB_APP_URL = 'https://ap-aljeel.accordpartners.ai';
    process.env.INVOICE_SUBMIT_NOTIFY_EMAILS = 'mlabadi@aljeel.com';
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const service = new SignatureNotificationService(
      { sendMail } as never,
      { notifyInvoiceSubmitted: vi.fn() } as never,
    );

    try {
      await service.notifyAwaitingSigner(turn);
    } finally {
      process.env.WEB_APP_URL = previous;
      process.env.INVOICE_SUBMIT_NOTIFY_EMAILS = previousRecipients;
    }

    expect(sendMail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: ['wkobessy@aljeel.com'],
        subject: 'Signature needed: SIG-MOCK-12',
      }),
    );
    const signerMail = sendMail.mock.calls[0]?.[0];
    const labadiMail = sendMail.mock.calls[1]?.[0];
    expect(signerMail?.html).toContain('/en/signatures/inv_123');
    expect(sendMail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: ['mlabadi@aljeel.com'],
        subject: 'Pending signature: SIG-MOCK-12',
      }),
    );
    expect(labadiMail?.text).toContain('pending signature');
    expect(labadiMail?.text).toContain('Waleed Kobessy');
    expect(labadiMail?.html).toContain('/en/invoices/inv_123');
  });

  it('still emails Labadi when the signer email fails', async () => {
    const previousRecipients = process.env.INVOICE_SUBMIT_NOTIFY_EMAILS;
    process.env.INVOICE_SUBMIT_NOTIFY_EMAILS = 'mlabadi@aljeel.com';
    const sendMail = vi
      .fn()
      .mockRejectedValueOnce(new Error('gog down'))
      .mockResolvedValueOnce(undefined);
    const service = new SignatureNotificationService(
      { sendMail } as never,
      { notifyInvoiceSubmitted: vi.fn() } as never,
    );

    try {
      await expect(service.notifyAwaitingSigner(turn)).rejects.toThrow('gog down');
    } finally {
      process.env.INVOICE_SUBMIT_NOTIFY_EMAILS = previousRecipients;
    }

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls[1]?.[0]?.to).toEqual(['mlabadi@aljeel.com']);
  });

  it('sends Labadi the same review email used on submit once the batch is ready', async () => {
    const notifyInvoiceSubmitted = vi.fn().mockResolvedValue(undefined);
    const service = new SignatureNotificationService(
      { sendMail: vi.fn() } as never,
      { notifyInvoiceSubmitted } as never,
    );
    const input = {
      invoiceId: 'inv_123',
      invoiceNumber: 'SIG-MOCK-12',
      supplierName: 'Asateel',
      submittedByEmail: 'amr+asateel@accordpartners.ai',
      submittedByName: 'Asateel Admin',
    };

    await service.notifyReadyForReview(input);

    expect(notifyInvoiceSubmitted).toHaveBeenCalledWith(input);
  });

  it('emails the supplier the rejection reason and a link back to the batch', async () => {
    const previous = process.env.WEB_APP_URL;
    process.env.WEB_APP_URL = 'https://ap-aljeel.accordpartners.ai';
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const service = new SignatureNotificationService(
      { sendMail } as never,
      { notifyInvoiceSubmitted: vi.fn() } as never,
    );

    try {
      await service.notifyRejected({
        invoiceId: 'inv_123',
        invoiceNumber: 'SIG-MOCK-12',
        reason: 'Delivery note is missing the stamp.',
        supplierEmails: ['amr+asateel@accordpartners.ai', ' amr+asateel@accordpartners.ai '],
      });
    } finally {
      process.env.WEB_APP_URL = previous;
    }

    expect(sendMail).toHaveBeenCalledTimes(1);
    const rejectedMail = sendMail.mock.calls[0]?.[0];
    expect(rejectedMail?.to).toEqual(['amr+asateel@accordpartners.ai']);
    expect(rejectedMail?.text).toContain('Delivery note is missing the stamp.');
    expect(rejectedMail?.html).toContain('/en/invoices/inv_123');
  });

  it('skips the supplier email when the supplier has no active users', async () => {
    const sendMail = vi.fn();
    const service = new SignatureNotificationService(
      { sendMail } as never,
      { notifyInvoiceSubmitted: vi.fn() } as never,
    );

    await service.notifyRejected({
      invoiceId: 'inv_123',
      invoiceNumber: 'SIG-MOCK-12',
      reason: 'Missing file',
      supplierEmails: [],
    });

    expect(sendMail).not.toHaveBeenCalled();
  });
});
