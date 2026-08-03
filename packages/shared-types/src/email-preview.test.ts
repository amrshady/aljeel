import { describe, expect, it } from 'vitest';
import {
  isEmailFileName,
  mightBeEmailDocument,
  sniffEmailFormat,
} from './email-preview';

const OLE_HEADER = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);

function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

describe('isEmailFileName', () => {
  it('matches .msg and .eml regardless of case', () => {
    expect(isEmailFileName('RE Family Tickets.msg')).toBe(true);
    expect(isEmailFileName('approval.EML')).toBe(true);
  });

  it('ignores non-email names', () => {
    expect(isEmailFileName('invoice.pdf')).toBe(false);
    expect(isEmailFileName('J26-1140_RE_Family_Tickets')).toBe(false);
  });
});

describe('mightBeEmailDocument', () => {
  it('probes files named as emails', () => {
    expect(mightBeEmailDocument('thread.msg', 'application/octet-stream')).toBe(true);
    expect(mightBeEmailDocument('thread.txt', 'message/rfc822')).toBe(true);
  });

  it('probes extensionless exports, which Outlook produces for long subjects', () => {
    expect(
      mightBeEmailDocument(
        'J26-1140_4860966757_Re_Approved_Personal_Contribution_Approval',
        'application/octet-stream',
      ),
    ).toBe(true);
  });

  it('skips types the viewer already renders or knowingly cannot', () => {
    expect(mightBeEmailDocument('invoice.pdf', 'application/pdf')).toBe(false);
    expect(mightBeEmailDocument('scan.png', 'image/png')).toBe(false);
    expect(mightBeEmailDocument('report.xlsx', 'application/octet-stream')).toBe(false);
  });

  it('treats a dotted subject line as extensionless rather than a known type', () => {
    expect(mightBeEmailDocument('Re: Ticket 4860966728.30', '')).toBe(true);
  });
});

describe('sniffEmailFormat', () => {
  it('detects .msg from the OLE compound-file signature', () => {
    expect(sniffEmailFormat(OLE_HEADER)).toBe('msg');
  });

  it('detects .eml from RFC 822 headers', () => {
    expect(
      sniffEmailFormat(bytesOf('From: a@example.com\r\nSubject: Hi\r\n\r\nBody')),
    ).toBe('eml');
  });

  it('returns null for other binaries', () => {
    expect(sniffEmailFormat(bytesOf('%PDF-1.7\n'))).toBeNull();
    expect(sniffEmailFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });
});
