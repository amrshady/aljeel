import { describe, expect, it } from 'vitest';
import { isValidJawalBatchId, JawalBatchIdSchema } from './index';

describe('Jawal batch IDs', () => {
  it('accepts a valid sequence ID', () => {
    expect(isValidJawalBatchId('J26-1080')).toBe(true);
    expect(JawalBatchIdSchema.safeParse('J26-1080').success).toBe(true);
  });

  it.each(['01-07jul', 'j26-1', 'J26-', 'J26-12a'])(
    'rejects invalid batch ID %s',
    (invoiceNumber) => {
      expect(isValidJawalBatchId(invoiceNumber)).toBe(false);
      expect(JawalBatchIdSchema.safeParse(invoiceNumber).success).toBe(false);
    },
  );
});
