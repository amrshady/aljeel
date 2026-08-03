import { z } from 'zod';
import { sniffEmlMagic } from './jawal-evidence-check';

/** Outlook `.msg` (OLE compound file) and RFC 822 `.eml` are both previewable as email. */
export const EmailPreviewFormatSchema = z.enum(['msg', 'eml']);
export type EmailPreviewFormat = z.infer<typeof EmailPreviewFormatSchema>;

export const EmailAddressSchema = z.object({
  name: z.string(),
  address: z.string(),
});
export type EmailAddress = z.infer<typeof EmailAddressSchema>;

export const EmailAttachmentSchema = z.object({
  index: z.number().int().nonnegative(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export type EmailAttachment = z.infer<typeof EmailAttachmentSchema>;

export const EmailPreviewSchema = z.object({
  format: EmailPreviewFormatSchema,
  subject: z.string(),
  from: EmailAddressSchema.nullable(),
  to: z.array(EmailAddressSchema),
  cc: z.array(EmailAddressSchema),
  sentAt: z.string().nullable(),
  /** Sanitized HTML body, safe to render inside a sandboxed iframe. */
  bodyHtml: z.string().nullable(),
  bodyText: z.string().nullable(),
  /** Attachments a reader would care about; inline signature images are excluded. */
  attachments: z.array(EmailAttachmentSchema),
  /** Images dropped because they were remote or too large to inline. */
  imagesNotShown: z.number().int().nonnegative(),
});
export type EmailPreview = z.infer<typeof EmailPreviewSchema>;

export const EMAIL_FILE_EXTENSIONS = ['msg', 'eml'] as const;

export const EMAIL_MIME_TYPES = [
  'application/vnd.ms-outlook',
  'application/vnd.ms-office',
  'message/rfc822',
] as const;

/** Extensions we already preview or knowingly cannot preview — never worth an email probe. */
const NON_EMAIL_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'tif',
  'tiff',
  'bmp',
  'svg',
  'xls',
  'xlsx',
  'xlsm',
  'csv',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'zip',
  'rar',
  '7z',
  'txt',
  'xml',
  'json',
  'mp4',
  'mov',
]);

function extensionOf(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function isEmailFileName(fileName: string): boolean {
  return (EMAIL_FILE_EXTENSIONS as readonly string[]).includes(extensionOf(fileName));
}

/**
 * Whether the portal should probe a document for email content. Exported `.msg`
 * files often lose their extension when the subject line is long, so anything
 * without a recognisable extension is worth probing too — the API sniffs the
 * real bytes and rejects non-email files.
 */
export function mightBeEmailDocument(fileName: string, mimeType: string): boolean {
  if (isEmailFileName(fileName)) return true;
  const normalizedMime = mimeType?.trim().toLowerCase() ?? '';
  if ((EMAIL_MIME_TYPES as readonly string[]).includes(normalizedMime)) return true;
  if (normalizedMime.startsWith('image/') || normalizedMime === 'application/pdf') {
    return false;
  }
  return !NON_EMAIL_EXTENSIONS.has(extensionOf(fileName));
}

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Detect email format from the leading bytes; returns null when it is not an email. */
export function sniffEmailFormat(head: Uint8Array): EmailPreviewFormat | null {
  if (head.length >= OLE_MAGIC.length && OLE_MAGIC.every((b, i) => head[i] === b)) {
    return 'msg';
  }
  return sniffEmlMagic(head).ok ? 'eml' : null;
}
