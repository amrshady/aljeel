/**
 * Tenant bucket layout — mirrors workers/files-portal/functions/api/[[path]].js
 * so AP portal uploads land in the same Spaces prefixes the KB sync indexes.
 */
export interface KbTenantConfig {
  bucket: string;
  region: string;
  /** Root key prefix inside the bucket (e.g. current/ or asateel/current/). */
  prefix: string;
}

export const KB_TENANT_BUCKETS: Record<string, KbTenantConfig> = {
  maher: { bucket: 'regent-maher-kb', region: 'sfo3', prefix: 'current/' },
  marwan: { bucket: 'regent-marwan-kb', region: 'sfo3', prefix: 'current/' },
  'aljeel-ap': { bucket: 'accord-aljeel-ap-kb', region: 'sfo3', prefix: 'current/' },
  asateel: { bucket: 'accord-aljeel-ap-kb', region: 'sfo3', prefix: 'asateel/current/' },
};

/** Default tenant for the Aljeel AP supplier portal. */
export const DEFAULT_KB_TENANT = 'aljeel-ap';

export function getKbTenantConfig(tenant: string): KbTenantConfig {
  const cfg = KB_TENANT_BUCKETS[tenant];
  if (!cfg) {
    throw new Error(`Unknown KB tenant: ${tenant}`);
  }
  return cfg;
}
