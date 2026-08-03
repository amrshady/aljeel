import { Injectable, Logger } from '@nestjs/common';
import MsgReader from '@kenjiuno/msgreader';
import type { FieldsData } from '@kenjiuno/msgreader';
import { decompressRTF } from '@kenjiuno/decompressrtf';
import { deEncapsulateSync } from 'rtf-stream-parser';
import { decode as iconvDecode, encodingExists } from 'iconv-lite';
import { simpleParser, type AddressObject, type Attachment } from 'mailparser';
import sanitizeHtml from 'sanitize-html';
import type {
  EmailAddress,
  EmailAttachment,
  EmailPreview,
  EmailPreviewFormat,
} from '@aljeel/shared-types';

/** A single inline image larger than this is linked instead of embedded. */
const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024;

/** Ceiling for all embedded images combined, so one email cannot blow up the response. */
const MAX_TOTAL_INLINE_BYTES = 8 * 1024 * 1024;

export interface EmailAttachmentContent {
  fileName: string;
  mimeType: string;
  content: Buffer;
}

export class EmailParseError extends Error {}

interface InlineImage {
  mimeType: string;
  content: Uint8Array;
}

/**
 * Outlook writes formatting into inline `style` attributes and legacy table
 * attributes, so keeping those is what makes an itinerary or approval table
 * readable. `<style>`, `<script>` and framing tags are dropped entirely.
 */
const SANITIZE_TAGS = [
  'a', 'b', 'blockquote', 'br', 'caption', 'center', 'code', 'col', 'colgroup',
  'dd', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strike',
  'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
  'u', 'ul',
];

const COMMON_ATTRIBUTES = [
  'align', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'class', 'color',
  'colspan', 'dir', 'face', 'height', 'lang', 'rowspan', 'size', 'style',
  'title', 'valign', 'width',
];

@Injectable()
export class EmailPreviewService {
  private readonly logger = new Logger(EmailPreviewService.name);

  async parse(buffer: Buffer, format: EmailPreviewFormat): Promise<EmailPreview> {
    try {
      return format === 'msg'
        ? this.parseMsg(buffer)
        : await this.parseEml(buffer);
    } catch (error) {
      this.logger.warn(
        `Failed to parse ${format} email preview: ${(error as Error).message}`,
      );
      throw new EmailParseError((error as Error).message);
    }
  }

  async readAttachment(
    buffer: Buffer,
    format: EmailPreviewFormat,
    index: number,
  ): Promise<EmailAttachmentContent | null> {
    try {
      return format === 'msg'
        ? this.readMsgAttachment(buffer, index)
        : await this.readEmlAttachment(buffer, index);
    } catch (error) {
      throw new EmailParseError((error as Error).message);
    }
  }

  // ---------------------------------------------------------------- .msg ---

  private parseMsg(buffer: Buffer): EmailPreview {
    const reader = new MsgReader(toArrayBuffer(buffer));
    const data = reader.getFileData();
    const attachments = data.attachments ?? [];

    const rawHtml = this.msgHtmlBody(data);
    const inlineImages = new Map<string, InlineImage>();
    const listed: EmailAttachment[] = [];

    attachments.forEach((attachment, index) => {
      const fileName = attachment.fileName || attachment.name || `attachment-${index + 1}`;
      const mimeType = attachment.attachMimeTag || guessMimeType(fileName);
      const contentId = normalizeContentId(attachment.pidContentId);
      const referenced =
        !!rawHtml &&
        ((!!contentId && rawHtml.includes(contentId)) || rawHtml.includes(fileName));

      if (referenced && mimeType.startsWith('image/')) {
        const content = readMsgAttachmentBytes(reader, index);
        if (content) {
          const image: InlineImage = { mimeType, content };
          if (contentId) inlineImages.set(contentId, image);
          inlineImages.set(fileName.toLowerCase(), image);
        }
        return;
      }
      if (referenced || attachment.attachmentHidden) {
        return;
      }
      listed.push({
        index,
        fileName,
        mimeType,
        sizeBytes: attachment.contentLength ?? 0,
      });
    });

    const body = renderBody(rawHtml, data.body ?? null, inlineImages);

    return {
      format: 'msg',
      subject: (data.subject ?? '').trim(),
      from: toAddress(
        data.senderName,
        data.senderSmtpAddress || data.senderEmail || undefined,
      ),
      to: msgRecipients(data, 'to'),
      cc: msgRecipients(data, 'cc'),
      sentAt: toIsoDate(data.clientSubmitTime ?? data.messageDeliveryTime),
      bodyHtml: body.html,
      bodyText: body.text,
      attachments: listed,
      imagesNotShown: body.imagesNotShown,
    };
  }

  /**
   * PidTagHtml holds the original HTML; when absent, Outlook keeps the same
   * markup encapsulated inside compressed RTF (`\fromhtml1`).
   */
  private msgHtmlBody(data: FieldsData): string | null {
    if (data.html && data.html.length > 0) {
      return decodeBytes(data.html, data.internetCodepage);
    }
    if (data.bodyHtml) {
      return data.bodyHtml;
    }
    if (!data.compressedRtf) {
      return null;
    }
    const rtf = Buffer.from(decompressRTF(Array.from(data.compressedRtf)));
    const result = deEncapsulateSync(rtf, { decode: iconvDecode });
    return result.mode === 'html' ? String(result.text) : null;
  }

  private readMsgAttachment(buffer: Buffer, index: number): EmailAttachmentContent | null {
    const reader = new MsgReader(toArrayBuffer(buffer));
    const fields = reader.getFileData().attachments ?? [];
    const meta = fields[index];
    if (!meta) return null;
    const attachment = reader.getAttachment(index);
    const fileName = attachment.fileName || meta.fileName || `attachment-${index + 1}`;
    return {
      fileName,
      mimeType: meta.attachMimeTag || guessMimeType(fileName),
      content: Buffer.from(attachment.content),
    };
  }

  // ---------------------------------------------------------------- .eml ---

  private async parseEml(buffer: Buffer): Promise<EmailPreview> {
    const mail = await simpleParser(buffer);
    const rawHtml = typeof mail.html === 'string' ? mail.html : null;

    const inlineImages = new Map<string, InlineImage>();
    const listed: EmailAttachment[] = [];

    mail.attachments.forEach((attachment, index) => {
      const fileName = attachment.filename || `attachment-${index + 1}`;
      const mimeType = attachment.contentType || guessMimeType(fileName);
      const contentId = normalizeContentId(attachment.cid);
      const isInline =
        attachment.contentDisposition === 'inline' ||
        (!!contentId && !!rawHtml && rawHtml.includes(contentId));

      if (isInline && mimeType.startsWith('image/')) {
        const image: InlineImage = { mimeType, content: attachment.content };
        if (contentId) inlineImages.set(contentId, image);
        inlineImages.set(fileName.toLowerCase(), image);
        return;
      }
      listed.push({
        index,
        fileName,
        mimeType,
        sizeBytes: attachment.size ?? attachment.content.length,
      });
    });

    const body = renderBody(rawHtml, mail.text ?? null, inlineImages);

    return {
      format: 'eml',
      subject: (mail.subject ?? '').trim(),
      from: mail.from?.value?.[0]
        ? toAddress(mail.from.value[0].name, mail.from.value[0].address)
        : null,
      to: emlRecipients(mail.to),
      cc: emlRecipients(mail.cc),
      sentAt: mail.date ? mail.date.toISOString() : null,
      bodyHtml: body.html,
      bodyText: body.text,
      attachments: listed,
      imagesNotShown: body.imagesNotShown,
    };
  }

  private async readEmlAttachment(
    buffer: Buffer,
    index: number,
  ): Promise<EmailAttachmentContent | null> {
    const mail = await simpleParser(buffer);
    const attachment: Attachment | undefined = mail.attachments[index];
    if (!attachment) return null;
    const fileName = attachment.filename || `attachment-${index + 1}`;
    return {
      fileName,
      mimeType: attachment.contentType || guessMimeType(fileName),
      content: Buffer.from(attachment.content),
    };
  }
}

// --------------------------------------------------------------- helpers ---

/** MsgReader needs a standalone ArrayBuffer; Node Buffers share a pooled one. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function readMsgAttachmentBytes(reader: MsgReader, index: number): Uint8Array | null {
  try {
    return reader.getAttachment(index).content;
  } catch {
    return null;
  }
}

function normalizeContentId(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^<|>$/g, '');
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

function toAddress(
  name: string | undefined | null,
  address: string | undefined | null,
): EmailAddress | null {
  const cleanName = (name ?? '').trim();
  const cleanAddress = (address ?? '').trim();
  if (!cleanName && !cleanAddress) return null;
  return { name: cleanName || cleanAddress, address: cleanAddress };
}

function msgRecipients(data: FieldsData, kind: 'to' | 'cc'): EmailAddress[] {
  return (data.recipients ?? [])
    .filter((recipient) => (recipient.recipType ?? 'to') === kind)
    .map((recipient) =>
      toAddress(recipient.name, recipient.smtpAddress || recipient.email),
    )
    .filter((address): address is EmailAddress => address !== null);
}

function emlRecipients(
  field: AddressObject | AddressObject[] | undefined,
): EmailAddress[] {
  if (!field) return [];
  const groups = Array.isArray(field) ? field : [field];
  return groups
    .flatMap((group) => group.value)
    .map((entry) => toAddress(entry.name, entry.address))
    .filter((address): address is EmailAddress => address !== null);
}

function toIsoDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function decodeBytes(bytes: Uint8Array, codepage: number | undefined): string {
  const encoding = codepage ? `windows-${codepage}` : 'utf8';
  const safeEncoding = encodingExists(encoding) ? encoding : 'utf8';
  return iconvDecode(Buffer.from(bytes), safeEncoding);
}

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  msg: 'application/vnd.ms-outlook',
  eml: 'message/rfc822',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME[ext] ?? 'application/octet-stream';
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes rather than strips, so text like `<not a tag>` survives verbatim. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!);
}

function textToHtml(text: string): string {
  return `<pre style="white-space:pre-wrap;font-family:inherit;margin:0">${escapeHtml(text)}</pre>`;
}

interface RenderedBody {
  html: string | null;
  text: string | null;
  imagesNotShown: number;
}

function renderBody(
  rawHtml: string | null,
  rawText: string | null,
  inlineImages: Map<string, InlineImage>,
): RenderedBody {
  const text = rawText && rawText.trim().length > 0 ? rawText : null;
  if (!rawHtml || rawHtml.trim().length === 0) {
    return { html: text ? textToHtml(text) : null, text, imagesNotShown: 0 };
  }
  const { html, imagesNotShown } = sanitizeEmailHtml(rawHtml, inlineImages);
  return { html, text, imagesNotShown };
}

/**
 * Embeds `cid:` images as data URIs and strips everything a stored email should
 * not be able to do — scripts, framing, forms, and remote requests that would
 * phone home to the sender when an AP reviewer opens the file.
 */
export function sanitizeEmailHtml(
  rawHtml: string,
  inlineImages: Map<string, InlineImage>,
): { html: string; imagesNotShown: number } {
  let inlinedBytes = 0;
  let imagesNotShown = 0;

  const html = sanitizeHtml(rawHtml, {
    allowedTags: SANITIZE_TAGS,
    allowedAttributes: {
      '*': COMMON_ATTRIBUTES,
      a: [...COMMON_ATTRIBUTES, 'href', 'name', 'rel', 'target'],
      img: [...COMMON_ATTRIBUTES, 'src', 'alt'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'title'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
      img: (tagName, attribs) => {
        const source = attribs.src ?? '';
        const cidMatch = /^cid:(.+)$/i.exec(source.trim());
        if (!cidMatch) {
          if (source.startsWith('data:image/')) return { tagName, attribs };
          imagesNotShown += 1;
          return { tagName, attribs: { ...attribs, src: '' } };
        }
        const key = normalizeContentId(decodeURIComponent(cidMatch[1]!));
        const image = key ? inlineImages.get(key) : undefined;
        if (
          !image ||
          image.content.length > MAX_INLINE_IMAGE_BYTES ||
          inlinedBytes + image.content.length > MAX_TOTAL_INLINE_BYTES
        ) {
          imagesNotShown += 1;
          return { tagName, attribs: { ...attribs, src: '' } };
        }
        inlinedBytes += image.content.length;
        const base64 = Buffer.from(image.content).toString('base64');
        return {
          tagName,
          attribs: { ...attribs, src: `data:${image.mimeType};base64,${base64}` },
        };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  });

  return { html, imagesNotShown };
}
