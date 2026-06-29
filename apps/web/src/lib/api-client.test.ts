import { describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@aljeel/shared-types';

describe('api client schemas', () => {
  it('validates health response shape', () => {
    const result = HealthResponseSchema.parse({
      status: 'ok',
      version: '0.0.1',
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(result.status).toBe('ok');
  });
});
