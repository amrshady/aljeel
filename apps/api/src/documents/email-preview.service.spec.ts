import { describe, expect, it } from 'vitest';
import { EmailPreviewService, sanitizeEmailHtml } from './email-preview.service';

/** 1x1 transparent GIF. */
const TINY_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

function buildEml({
  html,
  withAttachment = true,
}: {
  html: string;
  withAttachment?: boolean;
}): Buffer {
  const boundary = 'BOUNDARY123';
  const parts = [
    'From: "Sanad F. Al Shammari" <sfalshammari@aljeel.com>',
    'To: "Ahmed Mahmoud" <a.mahmoud@jawwaltravel.net>',
    'Cc: "Taghreed Abalkhail" <tabalkhail@aljeel.com>',
    'Subject: RE: Family Tickets - August',
    'Date: Mon, 27 Jul 2026 12:51:35 +0300',
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    `--${boundary}`,
    'Content-Type: image/gif',
    'Content-Transfer-Encoding: base64',
    'Content-ID: <logo@aljeel>',
    'Content-Disposition: inline; filename="logo.gif"',
    '',
    TINY_GIF.toString('base64'),
    '',
  ];
  if (withAttachment) {
    parts.push(
      `--${boundary}`,
      'Content-Type: application/pdf',
      'Content-Transfer-Encoding: base64',
      'Content-Disposition: attachment; filename="ticket.pdf"',
      '',
      Buffer.from('%PDF-1.7 fake ticket').toString('base64'),
      '',
    );
  }
  parts.push(`--${boundary}--`, '');
  return Buffer.from(parts.join('\r\n'), 'utf8');
}

describe('EmailPreviewService (.eml)', () => {
  const service = new EmailPreviewService();

  it('extracts headers, recipients and the send date', async () => {
    const preview = await service.parse(
      buildEml({ html: '<p>يعتمد</p>' }),
      'eml',
    );

    expect(preview.format).toBe('eml');
    expect(preview.subject).toBe('RE: Family Tickets - August');
    expect(preview.from).toEqual({
      name: 'Sanad F. Al Shammari',
      address: 'sfalshammari@aljeel.com',
    });
    expect(preview.to).toEqual([
      { name: 'Ahmed Mahmoud', address: 'a.mahmoud@jawwaltravel.net' },
    ]);
    expect(preview.cc).toEqual([
      { name: 'Taghreed Abalkhail', address: 'tabalkhail@aljeel.com' },
    ]);
    expect(preview.sentAt).toBe('2026-07-27T09:51:35.000Z');
  });

  it('embeds inline cid images and keeps them out of the attachment list', async () => {
    const preview = await service.parse(
      buildEml({ html: '<p><img src="cid:logo@aljeel" alt="logo"></p>' }),
      'eml',
    );

    expect(preview.bodyHtml).toContain('src="data:image/gif;base64,');
    expect(preview.bodyHtml).not.toContain('cid:');
    expect(preview.imagesNotShown).toBe(0);
    expect(preview.attachments).toEqual([
      {
        index: 1,
        fileName: 'ticket.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20,
      },
    ]);
  });

  it('reads an attachment back by index', async () => {
    const attachment = await service.readAttachment(
      buildEml({ html: '<p>hi</p>' }),
      'eml',
      1,
    );

    expect(attachment?.fileName).toBe('ticket.pdf');
    expect(attachment?.mimeType).toBe('application/pdf');
    expect(attachment?.content.toString()).toBe('%PDF-1.7 fake ticket');
  });

  it('returns null for an out-of-range attachment index', async () => {
    const attachment = await service.readAttachment(
      buildEml({ html: '<p>hi</p>' }),
      'eml',
      99,
    );
    expect(attachment).toBeNull();
  });

  it('falls back to the plain-text body when there is no HTML part', async () => {
    const eml = Buffer.from(
      [
        'From: a@example.com',
        'Subject: Plain',
        'Date: Mon, 27 Jul 2026 12:51:35 +0300',
        '',
        'Approved <not a tag>',
        '',
      ].join('\r\n'),
      'utf8',
    );

    const preview = await service.parse(eml, 'eml');
    expect(preview.bodyText).toContain('Approved');
    expect(preview.bodyHtml).toContain('&lt;not a tag&gt;');
  });
});

describe('sanitizeEmailHtml', () => {
  const noImages = new Map<string, { mimeType: string; content: Uint8Array }>();

  it('strips scripts, event handlers and framing tags', () => {
    const { html } = sanitizeEmailHtml(
      `<div onclick="steal()">Hi</div>
       <script>steal()</script>
       <iframe src="https://evil.test"></iframe>
       <style>body{background:url(https://evil.test/beacon)}</style>`,
      noImages,
    );

    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('evil.test');
    expect(html).toContain('Hi');
  });

  it('keeps the table markup that makes itineraries readable', () => {
    const { html } = sanitizeEmailHtml(
      '<table border="1"><tr><td style="background:#C5D9F1" width="61">Middle East Airlines</td></tr></table>',
      noImages,
    );

    expect(html).toContain('<table border="1">');
    expect(html).toContain('style="background:#C5D9F1"');
    expect(html).toContain('Middle East Airlines');
  });

  it('forces links to open in a new tab without leaking the referrer', () => {
    const { html } = sanitizeEmailHtml(
      '<a href="https://jawwaltravel.net">Book</a>',
      noImages,
    );

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it('drops remote images so opening an email cannot phone home', () => {
    const { html, imagesNotShown } = sanitizeEmailHtml(
      '<img src="https://tracker.test/pixel.gif">',
      noImages,
    );

    expect(html).not.toContain('tracker.test');
    expect(html).not.toContain('<img');
    expect(imagesNotShown).toBe(1);
  });

  it('drops cid images that are missing from the message', () => {
    const { html, imagesNotShown } = sanitizeEmailHtml(
      '<img src="cid:missing@aljeel">',
      noImages,
    );

    expect(html).not.toContain('<img');
    expect(imagesNotShown).toBe(1);
  });

  it('resolves cid references case-insensitively and after URL encoding', () => {
    const images = new Map([
      ['logo@aljeel', { mimeType: 'image/gif', content: new Uint8Array(TINY_GIF) }],
    ]);
    const { html, imagesNotShown } = sanitizeEmailHtml(
      '<img src="cid:LOGO%40aljeel">',
      images,
    );

    expect(html).toContain('data:image/gif;base64,');
    expect(imagesNotShown).toBe(0);
  });
});
