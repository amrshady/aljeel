# Known Issues — extraction, matching, recurring quirks

Recurring issues, lessons from QC rounds, and their resolved/open status. Add to this file when a new class of error surfaces.

---

## Resolved (v3 / current state)

### J&J 365 — extraction tail loss
- **Symptom:** SAR 389K gap between header total and sum of extracted lines (~13% of invoice missing)
- **Root cause:** Gemini silently dropping invoice tail pages when chunk_pages too large
- **Fix:** Reduced chunk_pages from 5 → 3 for invoices >100 lines OR >SAR 1M; added completeness_sar_ratio gate
- **Test:** completeness_sar_ratio = 0.997 on 365 after fix

### J&J 1444 — v2 normalize() regression
- **Symptom:** Invoice 1444 dropped from 100% match to ~45% after v2 normalize changes
- **Root cause:** Overly aggressive Arabic-char truncation broke description matching for certain catalog codes
- **Fix:** v3 normalize() refined truncation rule; restored 100% match
- **Lesson:** changes to normalize() need regression tests against all prior batches

### Asateel — false UNALLOCATED catches
- **Symptom:** v1 flagged 11 allocation rows as UNALLOCATED when they were legitimately cost-center-direct
- **Root cause:** allocation-row detection only counted rows with JQ ticket numbers
- **Fix:** Detection rule changed to "any row with AMOUNT set"

### Asateel 02868/02869 — date column parsed as 1970-01-01
- **Symptom:** Two invoices showed Jan 1 1970 dates
- **Root cause:** Excel serial date stored as raw int; pandas read as nanoseconds-from-epoch
- **Fix:** Custom `parse_excel_date()` checks int type and converts via `pd.Timestamp(1899-12-30) + Timedelta(days=int(v))`

### Jawal — 60% NO_FOLDER false-positive rate (v1)
- **Symptom:** v1 flagged 60% of legitimate tickets as NO_FOLDER
- **Root cause:** Folder names = first-leg ticket only; round-trip second legs had no folder
- **Fix:** PDF body-text extraction via pymupdf finds 10-digit ticket numbers embedded inside booking PDFs. Match rate 82.9% → 94.8%
- **Single biggest win.**

### Jawal — 8 false VAT_MISMATCH on international flights
- **Symptom:** v1 GL-name heuristic flagged international flights as VAT_MISMATCH
- **Root cause:** GL name doesn't distinguish KSA standard vs zero-rated VAT
- **Fix:** Use Details col 13 `vat_class` as source-of-truth

### Jawal — SELF_APPROVAL under-count (v2)
- **Symptom:** v3 QC found self-approval pattern not matching multi-space typos in filenames
- **Root cause:** Regex used single-space literal
- **Fix:** Changed to `\s+`

### Jawal — train ticket false NO_FOLDER
- **Symptom:** Train tickets with passenger name "Mohammed" failed match to folder named "Mohamed"
- **Root cause:** Transliteration variant
- **Fix:** Variant map (MOHAMMED ↔ MOHAMED ↔ MOHAMMAD); extend as new variants surface

---

## Open / known limits

### J&J — header vs PO total under-billing check
- **Status:** Not implemented
- **Signal:** Invoice header 3,050,104.59 vs PO sheet total 3,054,708.59 = SAR 4,604 under-billing
- **Action:** Need to add comparison + emit catch when delta > tolerance

### J&J — consignment implant expiry-date check
- **Status:** Not implemented
- **Signal:** Pre-alert has expiry per lot; short-dated lots are material for surgical implants on consignment
- **Action:** Confirm Aljeel's threshold (12mo / 24mo) before implementing

### Jawal — cost-center stability check
- **Status:** Not implemented
- **Signal:** Flag employees whose cost-center coding shifts across rows in the same week

### Jawal — scan-only PDF fallback
- **Status:** Not implemented
- **Risk:** Currently uses pymupdf body text. Pure-scan PDFs without text layer would silently fail folder match.
- **Mitigation:** All Jawal PDFs in sample batch had text layers. Add Gemini OCR fallback if this ever fires.

### Multi-month trend comparison
- **Status:** Not implemented
- **Need:** Once 2-3 months of data exist, show trends (vendor over/under-billing patterns, exception rate stability)

### Webhook/email on batch completion
- **Status:** Not implemented
- **Current:** Operator checks dashboard
- **Future:** Telegram ping on new batch

---

## Process lessons (from 3 QC rounds)

| Round | Pattern caught |
|---|---|
| v1 | Systematic over-flagging across all 3 pipelines |
| v2 | normalize() regression broke 1444; J&J 365 extraction tail still missing |
| v3 | Train ticket transliteration; multi-space typo in SELF_APPROVAL regex |

**Confidence arc:** v1 25-35% → v2 65-90% → v3 88-95% (demo-ready).

**Default pattern going forward:** Build → independent QC sub-agent → fix → re-QC. Single-pass shipping amplifies interpretation errors into headlines. Sub-agent QC is ~$2-3 per round × 3 rounds = $6-9 total; cheap insurance.
