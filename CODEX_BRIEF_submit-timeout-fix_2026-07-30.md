# Codex brief: ship the submit timeout + friendly error-message fix

Repo: /home/clawdbot/.openclaw/workspace/aljeel-repo (branch: main)

## Goal
Port ONLY the timeout / error-message fix from stranded backup commit `7cbd76d`
(branch backup/worktree-2026-07-23) onto main. Do NOT port the Asateel
region-mismatch guard (detectAsateelRegionFromTitle / ASATEEL_REGION_MISMATCH) —
that is deliberately parked. Do NOT re-add any Jawal batch-id validation or its
message — already shipped on main.

## Exact changes (4 files)

### 1. apps/web/src/lib/api-client.ts
- Rename `const REQUEST_TIMEOUT_MS = 15_000;` to
  `const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;`
- Change `apiFetch` options type to accept an optional per-request timeout:
  `options: RequestInit & { schema: z.ZodType<T>; timeoutMs?: number }`
- Destructure with default:
  `const { schema, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...init } = options;`
- Use `timeoutMs` in the `setTimeout(() => controller.abort(), timeoutMs)` call.
- Replace the TIMEOUT ApiClientError message
  `'API request timed out. Is the API running on port 3002?'`
  with:
  `'The server took too long to respond. For large uploads this can take a minute — please wait and try again. If it keeps happening, contact AP support.'`
- Replace the NETWORK_ERROR message
  `'Cannot reach the API. Run `pnpm dev` and ensure port 3002 is free.'`
  with:
  `'Could not reach the server. Check your connection and try again.'`

### 2. apps/web/src/lib/invoices-api.ts
- In `submitInvoice`, add `timeoutMs: 120_000,` to the apiFetch call options
  (alongside method + schema).

### 3. apps/web/src/lib/format-error.ts
- In `formatInvoiceError`, inside the `switch (err.code)`, add two new cases at
  the top (before the ASATEEL_* cases):
  `case 'TIMEOUT': return t('errors.timeout');`
  `case 'NETWORK_ERROR': return t('errors.network');`

### 4. apps/web/messages/en.json AND apps/web/messages/ar.json
- In the `invoiceForm.errors` object, add two keys (do NOT touch the existing
  jawalInvalidBatchId key — keep main's current wording):
  en.json:
    "timeout": "The server took too long to respond. For large uploads this can take a minute — please wait and try again. If it keeps happening, contact AP support.",
    "network": "Could not reach the server. Check your connection and try again.",
  ar.json:
    "timeout": "استغرق الخادم وقتاً طويلاً للاستجابة. قد تستغرق الملفات الكبيرة دقيقة — يرجى الانتظار ثم المحاولة مرة أخرى. إذا استمرت المشكلة، فتواصل مع دعم الحسابات الدائنة.",
    "network": "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.",

## After editing
- Run the web package typecheck/build if quick (pnpm --filter @aljeel/web typecheck
  or tsc). Report any type errors.
- Report the final diff. DO NOT deploy, DO NOT commit. Just leave the working tree
  edited and report the diff + files touched.
