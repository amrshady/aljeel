## Claimed fixes

1. **Surface missing Ref/Ticket rows — FAIL (partial).**  
   Description-bearing rows are now retained and blocked ([jawal-evidence-check.ts:435](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:435), [jawal-evidence-check.ts:814](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:814)). However, an earlier condition still discards rows where description is empty but account/type/OPEX contains line data ([jawal-evidence-check.ts:428](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:428)). B1 also still lacks numeric `*Amount` discovery/validation.

2. **Detect junk-only/empty folders — FAIL (partial).**  
   Junk-only and zero-byte-placeholder folders are now detected ([jawal-evidence-check.ts:526](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:526), [jawal-evidence-check.ts:778](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:778)). Truly empty folders remain invisible because validation receives file records only; no directory entries reach it. Thus A5 is not fully implemented.

3. **Reject truncated PDFs without `%%EOF` — PASS for the original defect.**  
   Missing EOF is now rejected regardless of file size ([jawal-evidence-check.ts:1050](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1050)). Full A2/A3 PDF validity remains incomplete: it does not render/open the PDF, validate page count/encryption/layers, or prove that an EOF found within the last 2048 bytes is the valid terminal marker.

4. **Byte-sniff `.eml`/images — FAIL per spec (partial).**  
   Upload bytes now reach the sniffer ([jawal-evidence-check.service.ts:71](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:71)), and extension signatures are checked. But images are not decoded ([jawal-evidence-check.ts:1073](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1073)); `.eml` accepts any single recognized header rather than parsing and requiring sender, subject, and date ([jawal-evidence-check.ts:1116](/home/clawdbot/.openclaw/workspace/aljeel-repo/packages/shared-types/src/jawal-evidence-check.ts:1116)). Read failures for non-spreadsheets are also silently left unflagged ([jawal-evidence-check.service.ts:113](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/jawal-evidence-check.service.ts:113)).

## Original 10 bugs after `cf1ceb4`

**FIXED**

- #4: Normal-sized PDFs missing `%%EOF` were accepted.

**OPEN**

- #1: Missing numeric `*Amount` enforcement; some missing-identifier rows still dropped.
- #2: Heuristic/non-exact B2 folder matching.
- #3: Complete EML/MSG parsing, image decoding, and PDF A3 validation.
- #5: Genuine empty-folder detection.
- #6: Duplicate numeric/free-text refs allowed.
- #7: Approval email can satisfy supporting-document requirement.
- #8: OPEX detection remains filename/path-based and does not require validated PDF content.
- #9: Event/OPEX allocation coverage not validated.
- #10: Partial-upload, lock-file, zero-width/RTL, and NFC filename requirements incomplete.

## Jawal/Asateel separation — PASS

`3151828..cf1ceb4` touches only:

- `apps/api/src/invoices/jawal-evidence-check.service.ts`
- `packages/shared-types/src/jawal-evidence-check.ts`
- `packages/shared-types/src/jawal-evidence-check.test.ts`

No Asateel file or shared validation path changed. Existing mutually exclusive supplier gates remain `ASATEEL` and `JAWAL` respectively ([invoices.service.ts:379](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:379), [invoices.service.ts:389](/home/clawdbot/.openclaw/workspace/aljeel-repo/apps/api/src/invoices/invoices.service.ts:389)). No leakage found.

## Verification

- Jawal shared-types tests: **PASS — 30/30**
- Test files: **PASS — 1/1**
- `@aljeel/shared-types` typecheck: **PASS**
- Repository remained unchanged.
