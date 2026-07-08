export const DEFAULT_INVOICE_SUBMIT_NOTIFY_EMAILS = [
  'mlabadi@aljeel.com',
  'amr@accordpartners.ai',
  'ahmed.samy@myregent.ai',
] as const;

export function parseInvoiceSubmitNotifyEmails(raw: string | undefined): string[] {
  if (raw === '') {
    return [];
  }
  const source = raw?.trim() ? raw : DEFAULT_INVOICE_SUBMIT_NOTIFY_EMAILS.join(',');
  return [...new Set(source.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean))];
}
