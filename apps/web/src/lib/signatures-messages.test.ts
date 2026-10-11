import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function messages(locale: 'en' | 'ar') {
  const file = resolve(__dirname, `../../messages/${locale}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as {
    signatures: Record<string, string>;
    apNav: { signatures: string };
    apReview: { status: Record<string, string>; pendingSignature?: string };
    invoiceDetail: { pendingSignature: string; status: Record<string, string> };
  };
}

describe('signature screen copy', () => {
  const en = messages('en');
  const ar = messages('ar');

  it('keeps English and Arabic signature strings in the same shape', () => {
    expect(Object.keys(ar.signatures).sort()).toEqual(Object.keys(en.signatures).sort());
    for (const key of Object.keys(en.signatures)) {
      expect(en.signatures[key]?.length).toBeGreaterThan(0);
      expect(ar.signatures[key]?.length).toBeGreaterThan(0);
    }
    expect(en.signatures.progress).toContain('{signed}');
    expect(en.signatures.progress).toContain('{total}');
    expect(ar.signatures.progress).toContain('{signed}');
    expect(ar.signatures.progress).toContain('{total}');
    expect(en.signatures.submitted).toContain('{date}');
    expect(ar.signatures.submitted).toContain('{date}');
    expect(en.apNav.signatures.length).toBeGreaterThan(0);
    expect(ar.apNav.signatures.length).toBeGreaterThan(0);
    expect(en.invoiceDetail.pendingSignature.length).toBeGreaterThan(0);
    expect(ar.invoiceDetail.pendingSignature.length).toBeGreaterThan(0);
    expect(en.apReview.status.AWAITING_SIGNATURE).toBe('Pending signature');
    expect(ar.apReview.status.AWAITING_SIGNATURE?.length).toBeGreaterThan(0);
  });
});
