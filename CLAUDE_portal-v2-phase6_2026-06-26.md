Phase 6 is built, deployed, and verified. Nothing in v1 was touched.

## Files added
| File | Role |
|---|---|
| `v2/components/evidence-tree.js` | **EvidenceTree** — builds the folder hierarchy client-side from the snapshot, lazy expand/collapse, file-type icons, humanized bytes + mtime, keyboard-operable, click→`onSelect`. Exports `fmtBytes`/`fileIconName`. |
| `v2/components/msg-reader.js` | **MsgReader** — the reader pane: structured email card / pdf iframe / inline image / binary download. |
| `v2/views/evidence.js` | **EvidenceView** — two-pane (tree ∣ reader) composition with lazy `load()`, skeletons, and empty/no-snapshot states. |

## Files changed
- `v2/views/run-detail.js` — replaced the Evidence-tab placeholder with `EvidenceView`'s node; `selectTab` calls `evidence.load()` (idempotent) the first time the tab opens, so no evidence fetch happens for runs you never inspect. Exceptions (Phase 7) and Logs (Phase 8) placeholders left intact.
- `v2/app.js` — added 5 Lucide icons (`mail`, `image`, `file-spreadsheet`, `external-link`, `paperclip`).
- `v2/tokens.css` — added a Phase 6 **layout-only** block (`.evidence`, `.evtree__*`, `.evreader__*`) using existing tokens only — no new colors/fonts.

## The version-skew catch
The Phase 6 prompt and spec §C.5 both describe the tree as nested `folders[]→files[]`. The **real** endpoint serves the worker's snapshot verbatim — a **flat** `folders:[{rel,mtime}]` + `files:[{rel,name,ext,bytes,mtime}]` (rel = full path). I matched the real shape: `EvidenceTree` derives the directory hierarchy by splitting each file's `rel`, and seeds dir nodes/mtimes from `folders`. (Saved to memory for later phases.)

## How file types are handled
- **.msg/.eml** → `evidence/file?rel=` JSON → structured card: subject heading, From, To chips, Date, attachment chips, and the body. Attachment chips download via `evidence/msg-attachment?rel=&attachment=<idx>`.
- **.pdf** → inline `<iframe>` (endpoint streams `Content-Type: application/pdf`, `Content-Disposition: inline`) + "Open in new tab" / "Download" toolbar.
- **images** (png/gif/jpg/svg…) → inline `<img>` with the same toolbar.
- **.xlsx / other binary** → no inline render; a clean download affordance.

## Safety
- **Escape:** every header *and the email body* are written with `text:` (textContent) — never `innerHTML`. Line breaks preserved purely via CSS `white-space: pre-wrap`. Body verified at 11,762 chars rendering safely.
- **Traversal:** `rel`/`attachment` are URL-encoded by the api.js wrappers and passed through unchanged; the server owns the guard. Confirmed `rel=../../../etc/passwd` → **400** `invalid_path`.

## Deploy
`npx wrangler pages deploy public --project-name aljeel-ap-finance --branch main` → **deployment `70ba5b0e`** (6 changed files uploaded). Root not cut over — v1 stays default; v2 at `/portal-v2`.
- Gated: `https://finance.aljeel.accordpartners.ai/portal-v2`
- Ungated (testing): `https://aljeel-ap-finance.pages.dev/portal-v2`

## Verification (through Cloudflare + real run data)
- **Gate intact** — unauthenticated `/v2/components/evidence-tree.js`, `/msg-reader.js`, `/v2/views/evidence.js`, and `/api/v2/runs/x/evidence/tree` all **302 → Cloudflare Access**.
- **Assets** on ungated production — all 5 JS modules **200 `application/javascript`**, `tokens.css` **200 `text/css`**; deployed bytes confirmed to contain the real Phase 6 code (EvidenceView wiring, flat-tree builder, body-escape, Phase 6 CSS, new icons) — not cached stubs.
- **Real data path** (curl vs `localhost:5000` with `Cf-Access-Authenticated-User-Email`, run `J26-788-…-075b83`):
  - `/evidence/tree` → 246 files / 91 folders, flat shape my tree consumes.
  - `.msg` rel → `{type:msg, subject, from, to[], date, body(11762), attachments[21]}`.
  - `.pdf` rel → `Content-Type: application/pdf`, `inline` → renders in my iframe.
  - msg-attachment idx 0 → 200 `image/png`; xlsx → inline binary (UI offers download); traversal → 400.

No SSE; SPLIT remains the only spreadsheet download; report label stays "Risk & Inconsistencies."
