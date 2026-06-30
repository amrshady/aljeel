import { describe, expect, it } from 'vitest';
import { formatBytes } from './upload';

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
