/**
 * Regent / Accord Files — Cloudflare Worker (Pages Functions style)
 *
 * Responsibilities:
 *   - Serve the static SPA from /
 *   - /api/whoami        — return signed-in user (from CF Access JWT header)
 *   - /api/files         — list files in the active tenant bucket (merges Spaces listing + KV archive state)
 *   - /api/upload-url    — sign a Spaces PUT URL
 *   - /api/upload-finalize — record the upload in KV, queue a sync ping to the droplet
 *   - /api/archive       — mark a file archived (KV only; bytes stay in Spaces)
 *   - /api/restore       — unmark archived
 *   - /api/download-url  — sign a Spaces GET URL; mode=preview returns inline PDF response overrides
 *
 * Auth: Cloudflare Access in front gates everything by email allowlist.
 *   Workers reads the email from cf-access-authenticated-user-email header.
 *
 * KV: REGENT_FILES_KV
 *   key: `archived:${tenant}:${path}`  value: { at, by }
 *   key: `event:${tenant}:${eventId}`  value: { kind, key, by, at } — 30-day audit log
 *
 * Env vars (configured as Pages Secrets):
 *   SPACES_ACCESS_KEY_ID
 *   SPACES_SECRET_ACCESS_KEY
 *   SPACES_REGION (e.g. sfo3)
 *   SPACES_ENDPOINT (e.g. sfo3.digitaloceanspaces.com)
 *   DROPLET_SYNC_TOKEN — shared secret with droplet sync poller; lets us verify webhook callbacks
 */

// `prefix` is the root key prefix inside the bucket (default 'current/').
// Multiple tenants can share ONE bucket with isolated prefixes — used to give
// Aljeel a separate "Asateel" tab (asateel/current/) without touching the
// existing Jawal data (current/) in the same accord-aljeel-ap-kb bucket.
const TENANT_BUCKETS = {
  maher: { bucket: 'regent-maher-kb', region: 'sfo3', prefix: 'current/' },
  marwan: { bucket: 'regent-marwan-kb', region: 'sfo3', prefix: 'current/' },
  'aljeel-ap': { bucket: 'accord-aljeel-ap-kb', region: 'sfo3', prefix: 'current/' },
  asateel: { bucket: 'accord-aljeel-ap-kb', region: 'sfo3', prefix: 'asateel/current/' }
};

// Allowlist of who can access which tenant. Cloudflare Access already gates this,
// but we double-check tenant scope inside the Worker for defense in depth.
// Each tenant's access list. Strings ending in `@domain.com` match any address
// in that domain (e.g. `@aljeel.com` admits every Aljeel employee). Literal
// addresses match exactly.
const TENANT_ACCESS = {
  maher:       ['amr@accordpartners.ai', 'malik@accordpartners.ai', '@aljeel.com'],
  marwan:      ['amr@accordpartners.ai', 'malik@accordpartners.ai', '@aljeel.com'],
  'aljeel-ap': ['amr@accordpartners.ai', 'malik@accordpartners.ai', 'ahmed.samy@myregent.ai', '@aljeel.com'],
  asateel:     ['amr@accordpartners.ai', 'malik@accordpartners.ai', '@aljeel.com']
};

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Resolve user email from CF Access. Primary: cf-access-authenticated-user-email header.
  // Fallback: decode JWT from Cf-Access-Jwt-Assertion header.
  let email = request.headers.get('cf-access-authenticated-user-email') || '';
  if (!email) {
    const jwt = request.headers.get('cf-access-jwt-assertion') || '';
    if (jwt) {
      try {
        const payload = jwt.split('.')[1];
        const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        email = decoded.email || decoded.identity_nonce || '';
      } catch (e) { /* invalid JWT, leave email empty */ }
    }
  }
  // For local testing without Access in front, allow if no header is set AND env.DEV_MODE === 'true'
  const isDev = env.DEV_MODE === 'true';

  if (path === '/api/whoami') {
    return json({ email: email || (isDev ? 'dev@local' : null) });
  }

  // Everything below requires auth
  if (!email && !isDev) {
    return json({ error: 'unauthorized' }, 401);
  }

  const effectiveEmail = email || 'dev@local';

  try {
    if (path === '/api/files') return await handleFiles(request, env, effectiveEmail);
    if (path === '/api/upload-url') return await handleUploadUrl(request, env, effectiveEmail);
    if (path === '/api/upload-finalize') return await handleUploadFinalize(request, env, effectiveEmail);
    if (path === '/api/archive') return await handleArchive(request, env, effectiveEmail);
    if (path === '/api/archive-folder') return await handleArchiveFolder(request, env, effectiveEmail);
    if (path === '/api/restore') return await handleRestore(request, env, effectiveEmail);
    if (path === '/api/restore-folder') return await handleRestoreFolder(request, env, effectiveEmail);
    if (path === '/api/download-url') return await handleDownloadUrl(request, env, effectiveEmail);
    if (path === '/api/events') return await handleEvents(request, env, effectiveEmail);
    if (path === '/api/sync-complete') return await handleSyncComplete(request, env);
    return json({ error: 'not_found', path }, 404);
  } catch (e) {
    console.error('API error', e);
    return json({ error: 'server_error', message: e.message }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function gateTenant(tenant, email) {
  const allowed = TENANT_ACCESS[tenant];
  if (!allowed) throw new Error(`unknown tenant: ${tenant}`);
  const lc = (email || '').toLowerCase();
  const ok = allowed.some(rule => {
    if (rule.startsWith('@')) return lc.endsWith(rule.toLowerCase());
    return lc === rule.toLowerCase();
  });
  if (!ok) {
    throw new Error(`access denied for ${email} on tenant ${tenant}`);
  }
}

// =====================================================
// LIST FILES
// =====================================================
async function handleFiles(request, env, email) {
  const url = new URL(request.url);
  const tenant = url.searchParams.get('tenant');
  gateTenant(tenant, email);
  const cfg = TENANT_BUCKETS[tenant];

  // Kick Spaces listing + archive-flag listing in parallel
  const [listed, archivedMap] = await Promise.all([
    spacesList(env, cfg, cfg.prefix),
    fetchArchivedMap(env, tenant),
  ]);

  const files = [];
  for (const obj of listed) {
    const relPath = obj.key.substring(cfg.prefix.length);
    if (!relPath) continue;
    const archived = archivedMap.get(relPath);
    files.push({
      path: relPath,
      size: obj.size,
      modified: obj.modified,
      etag: obj.etag,
      archived: !!archived,
      archived_at: archived ? archived.at : null,
      archived_by: archived ? archived.by : null,
    });
  }
  return json({ tenant, files, count: files.length });
}

// Fetch ALL archived flags for a tenant in one paginated KV.list (cheap, batched).
// Builds a Map(path -> { at, by }) so handleFiles does O(1) in-memory lookups.
async function fetchArchivedMap(env, tenant) {
  const map = new Map();
  const prefix = `archived:${tenant}:`;
  let cursor = undefined;
  do {
    const page = await env.REGENT_FILES_KV.list({ prefix, cursor });
    // KV.list only returns metadata, not values. Fetch values for the few that exist.
    // Typical case: archived count is small (<100) even for big tenants, so this is fast.
    const values = await Promise.all(
      page.keys.map(k => env.REGENT_FILES_KV.get(k.name, 'json'))
    );
    page.keys.forEach((k, i) => {
      const path = k.name.substring(prefix.length);
      if (values[i]) map.set(path, values[i]);
    });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return map;
}

// =====================================================
// UPLOAD URL
// =====================================================
async function handleUploadUrl(request, env, email) {
  const url = new URL(request.url);
  const tenant = url.searchParams.get('tenant');
  const name = url.searchParams.get('name');
  const size = parseInt(url.searchParams.get('size') || '0', 10);
  gateTenant(tenant, email);
  if (!name) return json({ error: 'name required' }, 400);
  if (size > 50 * 1024 * 1024) return json({ error: 'file too large (50 MB max)' }, 413);

  const cfg = TENANT_BUCKETS[tenant];
  // Sanitize: collapse runs of whitespace, trim each path segment, strip leading/trailing slashes.
  // Preserve '/' as path separators. Allow ampersands, parens, apostrophes, commas — all valid S3 chars.
  // Strip dangerous chars: '..' segments, NUL, control chars, leading dots on segments.
  const safe = name
    .split('/')
    .map(seg => seg.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim())
    .filter(seg => seg && seg !== '.' && seg !== '..')
    .join('/');
  if (!safe) return json({ error: 'invalid name after sanitization' }, 400);
  const key = `${cfg.prefix}${safe}`;

  const signed = await spacesPresign(env, cfg, key, 'PUT', 3600);
  return json({
    url: signed.url,
    headers: signed.headers,
    key: safe,
    expires_in: 3600
  });
}

// =====================================================
// UPLOAD FINALIZE
// =====================================================
async function handleUploadFinalize(request, env, email) {
  const body = await request.json();
  const { tenant, key, size } = body;
  gateTenant(tenant, email);

  // Clear any archived flag on the same path (re-upload = restore)
  await env.REGENT_FILES_KV.delete(`archived:${tenant}:${key}`);
  // Record event
  await recordEvent(env, tenant, { kind: 'upload', key, size, by: email });
  // Ping droplet sync (best effort — droplet also polls every 60s anyway)
  // TODO: webhook to droplet sync daemon
  return json({ ok: true, key });
}

// =====================================================
// ARCHIVE
// =====================================================
async function handleArchive(request, env, email) {
  const { tenant, key } = await request.json();
  gateTenant(tenant, email);
  const at = new Date().toISOString();
  await env.REGENT_FILES_KV.put(
    `archived:${tenant}:${key}`,
    JSON.stringify({ at, by: email }),
    { metadata: { tenant, key } }
  );
  await recordEvent(env, tenant, { kind: 'archive', key, by: email });
  return json({ ok: true, key, archived_at: at });
}

async function handleRestore(request, env, email) {
  const { tenant, key } = await request.json();
  gateTenant(tenant, email);
  await env.REGENT_FILES_KV.delete(`archived:${tenant}:${key}`);
  await recordEvent(env, tenant, { kind: 'restore', key, by: email });
  return json({ ok: true, key });
}

// Archive every file under a folder prefix in one shot.
// Body: { tenant, folder }  where folder is like "grc/Use Case" (no trailing slash, no leading current/)
async function handleArchiveFolder(request, env, email) {
  const { tenant, folder } = await request.json();
  gateTenant(tenant, email);
  if (!folder) return json({ error: 'folder required' }, 400);
  const cfg = TENANT_BUCKETS[tenant];

  // List all objects under <prefix><folder>/ from Spaces
  const prefix = `${cfg.prefix}${folder}/`;
  const listed = await spacesList(env, cfg, prefix);
  if (listed.length === 0) return json({ error: 'folder empty or not found', folder }, 404);

  const at = new Date().toISOString();
  const keys = [];
  // Write archived flags in parallel (KV.put returns fast; ~50 parallel is safe)
  await Promise.all(listed.map(async obj => {
    const relPath = obj.key.substring(cfg.prefix.length);
    if (!relPath) return;
    await env.REGENT_FILES_KV.put(
      `archived:${tenant}:${relPath}`,
      JSON.stringify({ at, by: email, folderArchive: folder }),
      { metadata: { tenant, key: relPath } }
    );
    keys.push(relPath);
  }));
  await recordEvent(env, tenant, { kind: 'archive-folder', folder, count: keys.length, by: email });
  return json({ ok: true, folder, archived: keys.length, archived_at: at });
}

async function handleRestoreFolder(request, env, email) {
  const { tenant, folder } = await request.json();
  gateTenant(tenant, email);
  if (!folder) return json({ error: 'folder required' }, 400);
  const cfg = TENANT_BUCKETS[tenant];
  const prefix = `${cfg.prefix}${folder}/`;
  const listed = await spacesList(env, cfg, prefix);
  if (listed.length === 0) return json({ error: 'folder empty or not found', folder }, 404);
  await Promise.all(listed.map(async obj => {
    const relPath = obj.key.substring(cfg.prefix.length);
    if (!relPath) return;
    await env.REGENT_FILES_KV.delete(`archived:${tenant}:${relPath}`);
  }));
  await recordEvent(env, tenant, { kind: 'restore-folder', folder, count: listed.length, by: email });
  return json({ ok: true, folder, restored: listed.length });
}

async function handleDownloadUrl(request, env, email) {
  const url = new URL(request.url);
  const tenant = url.searchParams.get('tenant');
  const key = url.searchParams.get('key');
  const mode = url.searchParams.get('mode');
  gateTenant(tenant, email);
  if (!key) return json({ error: 'key required' }, 400);
  const cfg = TENANT_BUCKETS[tenant];
  const isPreview = mode === 'preview';
  const filename = key.split('/').pop() || 'preview.pdf';
  const signed = await spacesPresign(env, cfg, `${cfg.prefix}${key}`, 'GET', 600, isPreview ? {
    'response-content-type': 'application/pdf',
    'response-content-disposition': `inline; filename="${filename.replace(/["\\]/g, '_')}"`,
    'response-cache-control': 'private, max-age=600'
  } : undefined);
  return json({ url: signed.url, expires_in: 600 });
}

async function handleEvents(request, env, email) {
  const url = new URL(request.url);
  const tenant = url.searchParams.get('tenant');
  gateTenant(tenant, email);
  const list = await env.REGENT_FILES_KV.list({ prefix: `event:${tenant}:` });
  const events = [];
  for (const k of list.keys.slice(-100)) {
    const e = await env.REGENT_FILES_KV.get(k.name, 'json');
    if (e) events.push(e);
  }
  events.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return json({ tenant, events });
}

async function handleSyncComplete(request, env) {
  // No CF Access JWT on this one — sync daemons on droplets call it.
  // Verify via SYNC_TOKEN shared secret header.
  const token = request.headers.get('x-sync-token') || '';
  if (env.DROPLET_SYNC_TOKEN && token !== env.DROPLET_SYNC_TOKEN) {
    return json({ error: 'bad_sync_token' }, 401);
  }
  const body = await request.json();
  const { tenant, hash, at } = body;
  await recordEvent(env, tenant, { kind: 'sync', hash, at, by: 'sync-daemon' });
  return json({ ok: true });
}

async function recordEvent(env, tenant, evt) {
  const id = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const stored = { id, at: new Date().toISOString(), ...evt };
  await env.REGENT_FILES_KV.put(
    `event:${tenant}:${id}`,
    JSON.stringify(stored),
    { expirationTtl: 60 * 60 * 24 * 30 } // 30 day audit log
  );
}

// =====================================================
// SPACES — S3-compatible client (SigV4)
// =====================================================
async function spacesList(env, cfg, prefix) {
  const host = `${cfg.bucket}.${cfg.region}.digitaloceanspaces.com`;
  const url = `https://${host}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;
  const signed = await signRequest({
    method: 'GET',
    url,
    host,
    region: cfg.region,
    accessKey: env.SPACES_ACCESS_KEY_ID,
    secretKey: env.SPACES_SECRET_ACCESS_KEY,
    service: 's3'
  });

  let allKeys = [];
  let continuationToken = '';
  do {
    const fetchUrl = continuationToken ? `${url}&continuation-token=${encodeURIComponent(continuationToken)}` : url;
    const signedNext = continuationToken ? await signRequest({
      method: 'GET',
      url: fetchUrl,
      host,
      region: cfg.region,
      accessKey: env.SPACES_ACCESS_KEY_ID,
      secretKey: env.SPACES_SECRET_ACCESS_KEY,
      service: 's3'
    }) : signed;

    const resp = await fetch(signedNext.url, { headers: signedNext.headers });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Spaces list HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const xml = await resp.text();

    // Parse <Contents>
    const re = /<Contents>([\s\S]*?)<\/Contents>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const block = m[1];
      const rawKey = (block.match(/<Key>([\s\S]*?)<\/Key>/) || [])[1];
      const key = decodeXmlEntities(rawKey || '');
      const size = parseInt((block.match(/<Size>([\s\S]*?)<\/Size>/) || [])[1] || '0', 10);
      const modStr = (block.match(/<LastModified>([\s\S]*?)<\/LastModified>/) || [])[1];
      const etag = decodeXmlEntities((block.match(/<ETag>([\s\S]*?)<\/ETag>/) || [])[1] || '');
      const modified = modStr ? new Date(modStr).getTime() : 0;
      if (key && !key.endsWith('/')) {
        allKeys.push({ key, size, modified, etag: etag.replace(/"/g, '') });
      }
    }

    const truncMatch = xml.match(/<IsTruncated>([\s\S]*?)<\/IsTruncated>/);
    if (truncMatch && truncMatch[1].trim() === 'true') {
      const nextMatch = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
      continuationToken = nextMatch ? nextMatch[1] : '';
    } else {
      continuationToken = '';
    }
  } while (continuationToken);

  return allKeys;
}

async function spacesPresign(env, cfg, key, method, expires, responseOverrides) {
  const host = `${cfg.bucket}.${cfg.region}.digitaloceanspaces.com`;
  // Encode every segment per RFC 3986. We preserve '/' as the path separator.
  // S3 sigv4 requires the canonical URI to be the percent-encoded path that
  // actually goes over the wire. We pass the encoded path AND the original
  // (decoded) key down so presignUrl can sign the encoded form without
  // round-tripping through URL.pathname (which would re-decode unicode).
  const encodedPath = key.split('/').map(encodeRFC3986).join('/');
  const url = new URL(`https://${host}/${encodedPath}`);
  if (responseOverrides) {
    Object.entries(responseOverrides).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const signed = await presignUrl({
    method,
    url: url.toString(),
    host,
    region: cfg.region,
    accessKey: env.SPACES_ACCESS_KEY_ID,
    secretKey: env.SPACES_SECRET_ACCESS_KEY,
    service: 's3',
    expires,
    canonicalUri: `/${encodedPath}`,  // explicit, do not derive from URL.pathname
  });
  return { url: signed, headers: {} };
}

// =====================================================
// AWS SigV4 (subset for S3-compatible Spaces)
// =====================================================
async function hmac(key, msg) {
  const k = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const m = typeof msg === 'string' ? new TextEncoder().encode(msg) : msg;
  const cryptoKey = await crypto.subtle.importKey('raw', k, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, m);
  return new Uint8Array(sig);
}

async function sha256Hex(msg) {
  const buf = typeof msg === 'string' ? new TextEncoder().encode(msg) : msg;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signRequest({ method, url, host, region, accessKey, secretKey, service, canonicalUri }) {
  const u = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substr(0, 8);

  // canonicalUri MUST equal the exact percent-encoded path bytes that go on the
  // wire. URL.pathname re-decodes unicode (Arabic / accented filenames), so
  // callers can pass the encoded form explicitly. Fall back to URL.pathname for
  // ASCII-only legacy paths.
  if (!canonicalUri) canonicalUri = u.pathname || '/';
  // AWS SigV4 requires each query param key+value individually RFC3986-encoded,
  // sorted by key. searchParams.toString() encodes space as '+', AWS expects '%20'.
  const canonicalQuery = canonicalQueryString(u.searchParams.entries());
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

  let signingKey = await hmac('AWS4' + secretKey, dateStamp);
  signingKey = await hmac(signingKey, region);
  signingKey = await hmac(signingKey, service);
  signingKey = await hmac(signingKey, 'aws4_request');
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: urlWithCanonicalQuery(host, canonicalUri, canonicalQuery),
    headers: {
      'host': host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'authorization': authorization
    }
  };
}

async function presignUrl({ method, url, host, region, accessKey, secretKey, service, expires, canonicalUri }) {
  const u = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substr(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  u.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  u.searchParams.set('X-Amz-Credential', `${accessKey}/${credentialScope}`);
  u.searchParams.set('X-Amz-Date', amzDate);
  u.searchParams.set('X-Amz-Expires', String(expires));
  u.searchParams.set('X-Amz-SignedHeaders', 'host');

  // canonicalUri MUST equal the exact percent-encoded path bytes that go on the
  // wire. URL.pathname re-decodes unicode, so callers pass the encoded form
  // explicitly. Fall back to URL.pathname for ASCII-only legacy paths.
  if (!canonicalUri) canonicalUri = u.pathname;
  const params = [...u.searchParams.entries()];
  const canonicalQuery = canonicalQueryString(params);
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

  let signingKey = await hmac('AWS4' + secretKey, dateStamp);
  signingKey = await hmac(signingKey, region);
  signingKey = await hmac(signingKey, service);
  signingKey = await hmac(signingKey, 'aws4_request');
  const signature = toHex(await hmac(signingKey, stringToSign));
  params.push(['X-Amz-Signature', signature]);

  return urlWithCanonicalQuery(host, canonicalUri, canonicalQueryString(params));
}

function decodeXmlEntities(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encodeRFC3986(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function canonicalQueryString(params) {
  return [...params]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${encodeRFC3986(k)}=${encodeRFC3986(v)}`)
    .join('&');
}

function urlWithCanonicalQuery(host, canonicalUri, canonicalQuery) {
  return `https://${host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
}
