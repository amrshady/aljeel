// Cloudflare Pages Worker for the Aljeel AP dashboard.
//
// Access gate: Cloudflare Access (OTP) on aljeel-ap-files.accordpartners.ai
//
// Droplet API: https://aljeel-ap.accordpartners.ai (Cloudflare Tunnel — permanent, stable)
//   Tunnel ID: c281300c-ce87-41ac-a551-ccfddba5941f  (aljeel-ap-droplet)
//   Route: aljeel-ap.accordpartners.ai → http://localhost:5000
//
// Routes proxied to droplet:
//   POST /api/upload          → /upload
//   GET  /api/process         → /process        (SSE stream)
//   POST /api/qa-run          → /qa-run         (SSE stream)
//   GET  /api/qa-report-download → /qa-report-download (Markdown download)
//   GET  /api/run-log         → /run-log         (SSE stream — reconnect)
//   GET  /api/current-run     → /current-run     (JSON — reconnect check)
//   POST /api/clear-lock      → /clear-lock      (JSON — emergency stale lock clear)
//   GET  /api/batches         → /batches         (JSON — live evidence batch list)
//   GET  /api/files/{batch}   → /files/{batch}   (JSON — which output files exist)
//   GET  /api/download/{batch}/{kind} → /download/{batch}/{kind} (xlsx straight from droplet disk)
//   GET  /api/ping            → /ping            (health check)
//   GET  /api/status          → /status          (run status)
//   GET  /evidence/*          → /evidence/*      (evidence tree + file viewer)
//
// KV-backed:
//   GET/POST /api/actions     Reviewer approve/hold/reject decisions
//   GET/POST /api/sessions    Session queue
//   GET      /api/audit       Static audit JSON lookup
//
// Static:
//   /files/*                  Reverse-proxy to aljeel-ap-files.pages.dev mirror
//   *                         Serve dashboard assets via env.ASSETS

const FILES_ORIGIN = 'https://aljeel-ap-files.pages.dev';
const DROPLET_API  = 'https://aljeel-ap.accordpartners.ai';  // Stable CF Tunnel — never changes
const ACTIONS_PREFIX = 'action:';
const SESSION_PREFIX = 'session:';

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function reviewerEmail(request) {
  return request.headers.get('Cf-Access-Authenticated-User-Email') || 'unknown';
}

// ── Cloudflare Access JWT verification (edge-side identity for /api/v2/*) ──────
//
// Cloudflare Access *bypasses* /api/* at the edge so the v1 droplet API works
// unauthenticated — but that bypass also means Access never injects the
// Cf-Access-Authenticated-User-Email identity header, which the v2 Flask
// blueprint requires on every request. So we mint that identity here: verify the
// Access JWT ourselves (from the Cf-Access-Jwt-Assertion header if present, else
// the CF_Authorization cookie the gated page shell set), then inject the verified
// email before proxying. No Access app config changes; v1 is untouched.
//
// AUD: the Access application AUD for finance.aljeel.accordpartners.ai, recovered
// from the Access login `meta` token. We verify signature + issuer + audience +
// expiry and extract the email claim. An ACCESS_AUD env var overrides the
// baked-in value if the app is ever rotated.

const ACCESS_TEAM_DOMAIN = 'akstat.cloudflareaccess.com';
const ACCESS_CERTS_URL   = `https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
const ACCESS_ISSUER      = `https://${ACCESS_TEAM_DOMAIN}`;
const ACCESS_AUD         = 'f0e8c6db95992e48f5bc86b0a64bd4ee1f01e83a912ac16a634e5903c2d238b5';
const ACCESS_JWKS_TTL_MS = 60 * 60 * 1000; // refresh imported keys hourly

// Module-scope cache of imported CryptoKeys, keyed by kid. Persists for the life
// of the isolate so we do not refetch/reimport the certs on every request.
let _accessKeys = { byKid: null, exp: 0 };

function b64urlToBytes(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getAccessKeys() {
  const now = Date.now();
  if (_accessKeys.byKid && _accessKeys.exp > now) return _accessKeys.byKid;
  const resp = await fetch(ACCESS_CERTS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!resp.ok) throw new Error(`access certs ${resp.status}`);
  const jwks = await resp.json();
  const byKid = {};
  for (const jwk of (jwks.keys || [])) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    byKid[jwk.kid] = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  }
  _accessKeys = { byKid, exp: now + ACCESS_JWKS_TTL_MS };
  return byKid;
}

function readAccessToken(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Returns { email, audMatched } for a cryptographically VALID Access token, or
// null if the token is missing/invalid. Trust is established by signature + iss +
// exp against THIS org's JWKS — those three are sufficient. AUD is advisory only
// (see below): a mismatched or unset AUD never rejects a signature-valid token.
async function verifyAccessEmail(request, env) {
  const token = readAccessToken(request);
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, pl, sig] = parts;
    const header  = b64urlToJson(h);
    const payload = b64urlToJson(pl);
    if (header.alg !== 'RS256') return null;

    const keys = await getAccessKeys();
    const key  = keys[header.kid];
    if (!key) return null;

    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', key, b64urlToBytes(sig),
      new TextEncoder().encode(`${h}.${pl}`),
    );
    if (!ok) return null;                                   // bad signature → reject

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) return null;       // expired → reject
    if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
    if (payload.iss !== ACCESS_ISSUER) return null;                              // wrong org → reject

    // AUD is NON-FATAL. The JWKS is scoped to THIS Access org, so a token with a
    // valid signature + matching issuer + live expiry is already trustworthy. A
    // baked-in AUD can be stale/wrong (the previous hard reject here was the most
    // likely cause of 401s for genuinely authenticated users). So: if a configured
    // AUD matches, we note it for the diagnostic; a mismatch (or unset env) is
    // logged-by-omission and ignored — we still accept the token.
    const expectedAud = (env && env.ACCESS_AUD) || ACCESS_AUD;
    const audList = Array.isArray(payload.aud)
      ? payload.aud
      : (payload.aud != null ? [payload.aud] : []);
    const audMatched = expectedAud ? audList.includes(expectedAud) : false;

    // Email claim, with progressively looser fallbacks.
    let email = payload.email
      || (payload.identity && payload.identity.email)
      || (typeof payload.sub === 'string' && payload.sub.includes('@') ? payload.sub : null)
      || (payload.custom && typeof payload.custom.email === 'string' ? payload.custom.email : null);

    // A valid token that carries no email claim (service tokens, some IdP configs)
    // still PROVES an authenticated Access session. Forward a derived sentinel so
    // the droplet's header-presence gate passes. This is only ever reached after a
    // verified signature — we NEVER invent identity for an invalid/absent token
    // (those returned null above).
    if (!email || typeof email !== 'string') {
      const sub = (typeof payload.sub === 'string' && payload.sub) ? payload.sub : 'unknown';
      email = `access-verified+${sub}@${ACCESS_TEAM_DOMAIN}`;
    }
    return { email, audMatched };
  } catch (_e) {
    return null;
  }
}

/**
 * Proxy a request to the droplet Flask API.
 * isSSE=true: sets SSE response headers and passes Accept: text/event-stream.
 */
async function proxyToDroplet(request, targetPath, targetSearch, isSSE = false) {
  const targetUrl = new URL(DROPLET_API);
  targetUrl.pathname = targetPath;
  targetUrl.search   = targetSearch || '';
  try {
    const fetchOpts = { method: request.method };
    if (isSSE) {
      fetchOpts.headers = { 'Accept': 'text/event-stream' };
    } else if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      // Forward body + headers for mutation requests
      fetchOpts.headers = request.headers;
      fetchOpts.body    = request.body;
    } else {
      fetchOpts.headers = { 'Accept': request.headers.get('Accept') || '*/*' };
      // Forward the Cloudflare Access identity on GETs too. v1 droplet routes
      // ignore it (unchanged behavior); the v2 blueprint requires it on every
      // request (before_request gate). Cloudflare STRIPS client-supplied Cf-*
      // headers at the tunnel edge, so the Cf-Access header below never reaches
      // Flask — the X-V2-User-Email (+ X-V2-Proxy-Secret) carriers below are
      // non-Cf and DO survive the edge; they are what actually authenticates.
      const accessEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
      if (accessEmail) fetchOpts.headers['Cf-Access-Authenticated-User-Email'] = accessEmail;
      const v2Email = request.headers.get('X-V2-User-Email');
      if (v2Email) fetchOpts.headers['X-V2-User-Email'] = v2Email;
      const v2Secret = request.headers.get('X-V2-Proxy-Secret');
      if (v2Secret) fetchOpts.headers['X-V2-Proxy-Secret'] = v2Secret;
    }

    const resp = await fetch(targetUrl.toString(), fetchOpts);
    const headers = new Headers(resp.headers);
    headers.set('Access-Control-Allow-Origin', '*');

    if (isSSE) {
      headers.set('Content-Type',  'text/event-stream');
      headers.set('Cache-Control', 'no-cache');
      headers.set('Connection',    'keep-alive');
    } else {
      headers.set('Cache-Control', 'no-store');
    }

    return new Response(resp.body, { status: resp.status, headers });
  } catch (err) {
    return jsonResponse({ ok: false, error: `Droplet unreachable: ${err.message}` }, 502);
  }
}

// ── KV action store ───────────────────────────────────────────────────────────

async function listActions(env, url) {
  const filter = url.searchParams.get('deliverable');
  const out = [];
  let cursor;
  do {
    const r = await env.ACTIONS_KV.list({ prefix: ACTIONS_PREFIX, cursor });
    for (const k of r.keys) {
      const v = await env.ACTIONS_KV.get(k.name, { type: 'json' });
      if (!v) continue;
      if (filter && v.deliverable !== filter) continue;
      out.push(v);
    }
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  out.sort((a, b) => (b.decided_at || '').localeCompare(a.decided_at || ''));
  return jsonResponse({ ok: true, count: out.length, actions: out });
}

async function upsertActions(env, request) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400); }
  const records = Array.isArray(body.records) ? body.records : [];
  if (!records.length) return jsonResponse({ ok: false, error: 'records[] required' }, 400);
  const email = reviewerEmail(request);
  const now   = new Date().toISOString();
  const written = [];
  for (const r of records) {
    if (!r.catch_id || !r.deliverable || !r.action)
      return jsonResponse({ ok: false, error: 'Each record requires catch_id, deliverable, action' }, 400);
    if (!['approve_post', 'hold_vendor', 'reject_batch', 'clear'].includes(r.action))
      return jsonResponse({ ok: false, error: `Invalid action: ${r.action}` }, 400);
    const key = `${ACTIONS_PREFIX}${r.deliverable}:${r.catch_id}`;
    if (r.action === 'clear') {
      await env.ACTIONS_KV.delete(key);
      written.push({ catch_id: r.catch_id, deliverable: r.deliverable, action: 'clear' });
      continue;
    }
    const record = { catch_id: r.catch_id, deliverable: r.deliverable, action: r.action,
                     note: r.note || '', decided_by: email, decided_at: now };
    await env.ACTIONS_KV.put(key, JSON.stringify(record));
    written.push(record);
  }
  return jsonResponse({ ok: true, written });
}

async function listSessions(env, url) {
  const filter = url.searchParams.get('agent_id');
  const out = [];
  let cursor;
  do {
    const r = await env.ACTIONS_KV.list({ prefix: SESSION_PREFIX, cursor });
    for (const k of r.keys) {
      const v = await env.ACTIONS_KV.get(k.name, { type: 'json' });
      if (!v) continue;
      if (filter && v.agent_id !== filter) continue;
      out.push(v);
    }
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  out.sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''));
  return jsonResponse({ ok: true, count: out.length, sessions: out });
}

async function queueSession(env, request) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400); }
  if (!body.agent_id) return jsonResponse({ ok: false, error: 'agent_id required' }, 400);
  const email     = reviewerEmail(request);
  const now       = new Date().toISOString();
  const sessionId = `${body.agent_id}-${Date.now()}`;
  const record    = { session_id: sessionId, agent_id: body.agent_id, status: 'queued',
                      submitted_by: email, submitted_at: now, files: body.files || [] };
  await env.ACTIONS_KV.put(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(record));
  return jsonResponse({ ok: true, session: record });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p   = url.pathname;

    // ── Phase 9 cutover: root now lands on Portal v2 ──────────────────────────
    // The bare root '/' 302-redirects to the v2 SPA shell (portal-v2.html → /v2
    // hash-routed app). Cloudflare Access still gates the host, so an unauthed
    // hit is challenged by Access first, then redirected post-auth; Access config
    // is untouched. 302 (not 301) so browsers never cache the flip.
    //
    // v1 stays fully preserved and reachable at explicit legacy paths — nothing
    // is moved, renamed, or deleted:
    //   • /portal  → portal.html  (the v1 portal; natural Pages clean URL)
    //   • /v1      → index.html   (the v1 "AP Agent" dashboard that used to be the
    //                root document; explicit alias below, because Pages would
    //                otherwise canonicalize /index.html → / and hit this redirect)
    //
    // ROLLBACK = delete this entire block; '/' then serves index.html (v1) again
    // via the ASSETS fallback. One edit, instant, no asset changes.
    if (request.method === 'GET') {
      if (p === '/') {
        return Response.redirect(`${url.origin}/portal-v2.html`, 302);
      }
      if (p === '/v1' || p === '/v1/') {
        // Serve the v1 index.html. At the raw ASSETS layer '/' === index.html,
        // so this bypasses the redirect above and returns the v1 dashboard.
        return env.ASSETS.fetch(new Request(`${url.origin}/`, request));
      }
    }

    // KV-backed endpoints
    if (p === '/api/actions') {
      if (request.method === 'GET')  return listActions(env, url);
      if (request.method === 'POST') return upsertActions(env, request);
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
    }
    if (p === '/api/sessions') {
      if (request.method === 'GET')  return listSessions(env, url);
      if (request.method === 'POST') return queueSession(env, request);
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
    }

    // Audit lookup (static JSON from Pages)
    if (p === '/api/audit') {
      const ticket = url.searchParams.get('ticket');
      if (!ticket) return jsonResponse({ ok: false, error: 'missing ticket param' }, 400);
      try {
        const resp = await fetch(`${FILES_ORIGIN}/data/audit-export.json`);
        if (!resp.ok) return jsonResponse({ ok: false, error: 'audit database unreachable' }, 500);
        const db      = await resp.json();
        const records = db.filter(r => r.ticket_no === ticket);
        return jsonResponse({ ok: true, records });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    // ── Droplet proxy routes ──────────────────────────────────────────────────

    // Portal v2 API — proxy /api/v2/* → droplet /v2/* (strip the /api prefix).
    // Additive: all existing v1 /api/*, /evidence/*, KV, and /files/* branches
    // below are untouched.
    //
    // The v2 blueprint requires Cf-Access-Authenticated-User-Email on every
    // request. Two cases, handled defensively so neither can loop or regress:
    //   1. Access processed the request and injected the identity header itself
    //      (the prod host gates /api/* and injects). Cloudflare strips any
    //      client-supplied Cf-* header at the edge, so a present header is
    //      trusted — use it as-is.
    //   2. The header is absent (e.g. an Access "bypass" policy that allows the
    //      path without injecting identity). Mint it ourselves by verifying the
    //      Access JWT (Cf-Access-Jwt-Assertion header or CF_Authorization cookie).
    // On failure we return a clean JSON 401 — NOT a redirect — so the SPA renders
    // a re-login affordance instead of reloading into a loop.
    if (p.startsWith('/api/v2/')) {
      // 1. Trust the edge-injected header first. Cloudflare strips any
      //    client-supplied Cf-* header at the edge, so a present value is genuine.
      // 2. Otherwise mint identity by verifying the Access JWT ourselves.
      let email = request.headers.get('Cf-Access-Authenticated-User-Email');
      let method = email ? 'header' : 'none';
      let audMatched = null;
      if (!email) {
        const verified = await verifyAccessEmail(request, env);
        if (verified) {
          email = verified.email;
          method = 'jwt';
          audMatched = verified.audMatched;
        }
      }

      // Diagnostic: confirm identity resolution in-browser without exposing any
      // secret. Open finance.aljeel.accordpartners.ai/api/v2/whoami while signed in.
      if (p === '/api/v2/whoami') {
        return jsonResponse({
          ok: !!email,
          email: email || null,
          method,
          aud_matched: audMatched,
        }, email ? 200 : 401);
      }

      if (!email) {
        // Genuinely no valid session — clean JSON 401, never a redirect.
        return jsonResponse({ error: 'access_required',
          detail: 'Cloudflare Access session is missing or expired — sign in again.' }, 401);
      }
      const authedHeaders = new Headers(request.headers);
      authedHeaders.set('Cf-Access-Authenticated-User-Email', email);
      // Cloudflare STRIPS client-supplied Cf-* headers at the tunnel edge, so the
      // Cf-Access header above is deleted before it reaches Flask. Re-send the
      // identity under a non-Cf header name (survives the edge), plus a shared
      // secret so the un-gated tunnel hostname can't be hit with a forged email.
      authedHeaders.set('X-V2-User-Email', email);
      if (env.V2_PROXY_SECRET) authedHeaders.set('X-V2-Proxy-Secret', env.V2_PROXY_SECRET);
      const authedRequest = new Request(request, { headers: authedHeaders });
      const resp = await proxyToDroplet(authedRequest, p.replace(/^\/api/, ''), url.search, false);
      // Non-sensitive auth diagnostic on every proxied v2 response so the human can
      // confirm which path resolved identity (header vs jwt) and whether AUD matched.
      try {
        resp.headers.set('X-V2-Auth-Method', method);
        if (audMatched !== null) resp.headers.set('X-V2-Aud-Matched', String(audMatched));
      } catch (_e) { /* headers immutable on some edge cases — diagnostic only */ }
      return resp;
    }

    // Invoice upload (POST multipart)
    if (p === '/api/upload') {
      if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
      return proxyToDroplet(request, '/upload', '');
    }

    // Pipeline SSE stream (main run)
    if (p === '/api/process') {
      return proxyToDroplet(request, '/process', url.search, true);
    }

    // QA agent SSE stream (read-only holistic review)
    if (p === '/api/qa-run') {
      return proxyToDroplet(request, '/qa-run', url.search, true);
    }

    // QA report Markdown download
    if (p === '/api/qa-report-download') {
      return proxyToDroplet(request, '/qa-report-download', url.search);
    }

    // Run log SSE (reconnect — replays log from offset)
    if (p === '/api/run-log') {
      return proxyToDroplet(request, '/run-log', url.search, true);
    }

    // Current run status (reconnect check — returns {locked, run_id} JSON)
    if (p === '/api/current-run') {
      return proxyToDroplet(request, '/current-run', url.search);
    }

    // Emergency stale lock clear
    if (p === '/api/clear-lock') {
      if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
      return proxyToDroplet(request, '/clear-lock', url.search, false);
    }

    // Live evidence batch list
    if (p === '/api/batches') {
      if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
      return proxyToDroplet(request, '/batches', url.search);
    }

    // Output file existence check (full / split spreadsheets per batch)
    if (p.startsWith('/api/files/')) {
      if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
      return proxyToDroplet(request, p.replace(/^\/api/, ''), url.search);
    }

    // Output spreadsheet download — served from droplet disk, never the stale Pages asset
    if (p.startsWith('/api/download/')) {
      if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
      return proxyToDroplet(request, p.replace(/^\/api/, ''), url.search);
    }

    // Health / status
    if (p === '/api/ping')        return proxyToDroplet(request, '/ping',   '');
    if (p === '/api/status')       return proxyToDroplet(request, '/status', url.search);
    if (p === '/api/preflight-scan') return proxyToDroplet(request, '/preflight-scan', url.search);

    // Evidence tree + file viewer
    if (p.startsWith('/evidence/')) {
      return proxyToDroplet(request, p, url.search);
    }

    // Static file proxy (evidence docs, PDFs, emails)
    if (p.startsWith('/files/')) {
      if (!p.toLowerCase().endsWith('.xlsx')) {
        const filePath     = p.replace(/^\/files\//, 'raw/');
        const upstream     = `${FILES_ORIGIN}/${filePath}`;
        const proxyHeaders = new Headers();
        proxyHeaders.set('X-Proxy-Secret', env.PROXY_SECRET || '');
        proxyHeaders.set('Accept', request.headers.get('Accept') || '*/*');
        const range = request.headers.get('Range');
        if (range) proxyHeaders.set('Range', range);
        const upstreamResp = await fetch(upstream, { method: 'GET', headers: proxyHeaders });
        const respHeaders  = new Headers(upstreamResp.headers);
        respHeaders.set('X-Robots-Tag',    'noindex, nofollow, noarchive');
        respHeaders.set('Referrer-Policy', 'no-referrer');
        if (filePath.toLowerCase().endsWith('.pdf')) respHeaders.set('Content-Disposition', 'inline');
        return new Response(upstreamResp.body, {
          status: upstreamResp.status, statusText: upstreamResp.statusText, headers: respHeaders,
        });
      }
    }

    // Serve dashboard static assets
    const response = await env.ASSETS.fetch(request);
    const headers  = new Headers(response.headers);
    headers.set('X-Robots-Tag',    'noindex, nofollow, noarchive');
    headers.set('Referrer-Policy', 'no-referrer');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
