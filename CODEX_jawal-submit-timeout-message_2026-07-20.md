Implemented the frontend-only fix.

Files touched:

- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/invoices-api.ts`
- `apps/web/src/lib/format-error.ts`
- `apps/web/messages/en.json`
- `apps/web/messages/ar.json`

Both invoice pages already call the shared `submitInvoice()` helper, so no page-level edits were necessary. That helper now uses a 120-second timeout.

The existing non-OK response handling remains unchanged: valid `ApiErrorSchema` responses still throw the backend’s exact code, message, details, and trace ID. Existing `JAWAL_*` and `ASATEEL_*` formatting therefore continues to surface real validation results.

No build or deployment was run. `git diff --check` passed.

Confirmed no files under `apps/api/src/invoices/` or `packages/shared-types` were modified.

Full diff:

```diff
diff --git a/apps/web/messages/ar.json b/apps/web/messages/ar.json
index 507c597..ef6b9a1 100644
--- a/apps/web/messages/ar.json
+++ b/apps/web/messages/ar.json
@@ -141,6 +141,8 @@
     "uploadingFiles": "جاري رفع الملفات…",
     "error": "تعذر حفظ الفاتورة",
     "errors": {
+      "timeout": "استغرق الخادم وقتاً طويلاً للاستجابة. قد تستغرق الملفات الكبيرة دقيقة — يرجى الانتظار ثم المحاولة مرة أخرى. إذا استمرت المشكلة، فتواصل مع دعم الحسابات الدائنة.",
+      "network": "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.",
       "filesRequired": "يرجى إرفاق ملف واحد على الأقل قبل التقديم للمراجعة",
       "xlsxRequired": "يرجى إرفاق ملفّي Excel (.xlsx) على الأقل قبل التقديم للمراجعة",
       "asateelFilesMissing": "ملفات PDF مفقودة لأرقام الفواتير: {numbers}",
diff --git a/apps/web/messages/en.json b/apps/web/messages/en.json
index acf98bc..ef28b67 100644
--- a/apps/web/messages/en.json
+++ b/apps/web/messages/en.json
@@ -141,6 +141,8 @@
     "uploadingFiles": "Uploading files…",
     "error": "Could not save invoice",
     "errors": {
+      "timeout": "The server took too long to respond. For large uploads this can take a minute — please wait and try again. If it keeps happening, contact AP support.",
+      "network": "Could not reach the server. Check your connection and try again.",
       "filesRequired": "Please attach at least one file before submitting for review",
       "xlsxRequired": "Please attach at least two Excel (.xlsx) files before submitting for review",
       "asateelFilesMissing": "Missing PDF files for invoice numbers: {numbers}",
diff --git a/apps/web/src/lib/api-client.ts b/apps/web/src/lib/api-client.ts
index d4f7843..7e620f6 100644
--- a/apps/web/src/lib/api-client.ts
+++ b/apps/web/src/lib/api-client.ts
@@ -17,13 +17,13 @@ function getBaseUrl(): string {
   return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/api/v1';
 }
 
-const REQUEST_TIMEOUT_MS = 15_000;
+const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
 
 export async function apiFetch<T>(
   path: string,
-  options: RequestInit & { schema: z.ZodType<T> },
+  options: RequestInit & { schema: z.ZodType<T>; timeoutMs?: number },
 ): Promise<T> {
-  const { schema, ...init } = options;
+  const { schema, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...init } = options;
   const headers = new Headers(init.headers);
   const isFormData =
     typeof FormData !== 'undefined' && init.body instanceof FormData;
@@ -32,7 +32,7 @@ export async function apiFetch<T>(
   }
 
   const controller = new AbortController();
-  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
+  const timeout = setTimeout(() => controller.abort(), timeoutMs);
 
   let response: Response;
   try {
@@ -46,13 +46,13 @@ export async function apiFetch<T>(
     if (error instanceof Error && error.name === 'AbortError') {
       throw new ApiClientError(
         'TIMEOUT',
-        'API request timed out. Is the API running on port 3002?',
+        'The server took too long to respond. For large uploads this can take a minute — please wait and try again. If it keeps happening, contact AP support.',
         'unknown',
       );
     }
     throw new ApiClientError(
       'NETWORK_ERROR',
-      'Cannot reach the API. Run `pnpm dev` and ensure port 3002 is free.',
+      'Could not reach the server. Check your connection and try again.',
       'unknown',
     );
   } finally {
diff --git a/apps/web/src/lib/format-error.ts b/apps/web/src/lib/format-error.ts
index 66c779b..4bc4d5c 100644
--- a/apps/web/src/lib/format-error.ts
+++ b/apps/web/src/lib/format-error.ts
@@ -107,6 +107,10 @@ export function formatInvoiceError(
     }
 
     switch (err.code) {
+      case 'TIMEOUT':
+        return t('errors.timeout');
+      case 'NETWORK_ERROR':
+        return t('errors.network');
       case 'ASATEEL_INVOICE_TABLE_REQUIRED':
         return t('errors.asateelTableRequired');
       case 'ASATEEL_INVOICE_TABLE_EMPTY':
diff --git a/apps/web/src/lib/invoices-api.ts b/apps/web/src/lib/invoices-api.ts
index 81fbec2..1299e93 100644
--- a/apps/web/src/lib/invoices-api.ts
+++ b/apps/web/src/lib/invoices-api.ts
@@ -69,6 +69,7 @@ export function updateInvoiceAsateelRegion(id: string, asateelRegion: AsateelReg
 export function submitInvoice(id: string) {
   return apiFetch(`/invoices/${id}/submit`, {
     method: 'POST',
+    timeoutMs: 120_000,
     schema: SubmitInvoiceResponseSchema,
   });
 }
```
