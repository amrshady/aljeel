import { describe, expect, it } from 'vitest';
import { DEFAULT_KB_TENANT, getKbTenantConfig } from './config';

describe('getKbTenantConfig', () => {
  it('returns config for a known tenant', () => {
    const cfg = getKbTenantConfig('aljeel-ap');
    expect(cfg.bucket).toBe('accord-aljeel-ap-kb');
    expect(cfg.region).toBe('sfo3');
    expect(cfg.prefix).toBe('current/');
  });

  it('throws for an unknown tenant', () => {
    expect(() => getKbTenantConfig('unknown')).toThrow('Unknown KB tenant: unknown');
  });

  it('uses aljeel-ap as the default tenant', () => {
    expect(DEFAULT_KB_TENANT).toBe('aljeel-ap');
  });
});
