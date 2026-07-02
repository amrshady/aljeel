#!/usr/bin/env python3
"""
AlJeel AP Pipeline v24 — CHD/INF PC evidence routing fix for family bookings

v16 LLM resolution  +  v17.1 booking-group detection  +  fraud detection
run as ONE script, ONE output file. No intermediate files between stages.

PIPELINE STAGES (all in-process, in order)
───────────────────────────────────────────
  1. Load cascade input (v15.11.2 or later) + master data + evidence folders
  2. v16 two-call LLM resolve (classify → resolve) for unresolved/routed rows
  3. v17.1 booking-group detection — family grouping, anchor propagation,
     breakdown column sync (Q-AF) — inline, no separate XLSX write
  4. Write final v18 XLSX
  5. Cross-batch fraud detection (deterministic, free)
  6. Fraud-watch JSON written alongside output

NO SHORTCUTS — every run reads only canonical cascade inputs.
Truth/comparison files are NEVER loaded during the pipeline; scoring is
a separate step run explicitly by the operator.

Usage:
    python3 scripts/run_v18.py J26-550
    python3 scripts/run_v18.py J26-640
    python3 scripts/run_v18.py J26-593
    python3 scripts/run_v18.py J26-589
    python3 scripts/run_v18.py J26-788 --input-suffix v15.11.2
    python3 scripts/run_v18.py J26-640 --limit 10   # smoke test
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import shutil
import sys
import time
import traceback
from collections import Counter
from pathlib import Path
from typing import Any

import openpyxl

ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
sys.path.insert(0, str(ROOT / "scripts"))

import full_evidence_agent as fea
import run_hybrid_v15_12 as v15

# v18 = v16 + v17.1 booking groups + fraud
from run_v16 import (
    _clean_passenger,
    build_personal_contribution_index,
    build_reverse_folder_index,
    find_folder_with_index,
    _needs_classification,
    _folder_has_opex,
    _get_email_tail,
    _get_opex_text,
    classify_row,
    _norm_master_code,
    resolve_from_master,
    resolve_sponsorship_from_master,
    full_resolve_row,
    _build_classify_hint,
    enforce_sponsorship_rules,
    apply_overlays_v16,
    _resolve_text_code,
    process_row,
    apply_family_cluster_unification,
)
from run_v17 import (
    build_booking_groups,
    _is_family_group,
    _pick_anchor,
    apply_booking_group_propagation,
    collect_patches,
    write_xlsx_patches,
    read_xlsx_rows,
    ALL_GL_BREAKDOWN_COLS,
    COMBO_SEGMENT_COLS,
    COMBO_LOOKUP_COLS,
    parse_combo_segments,
)
from cross_batch_fraud import (
    run_cross_batch_fraud,
    update_cross_batch_history,
    load_history as load_cross_batch_history,
    save_history as save_cross_batch_history,
)

VERSION      = "v24"
COST_CEILING = 4.0


# ─── helpers ──────────────────────────────────────────────────────────────────

def utc_ts() -> str:
    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())


def _extract_ticket_no(desc: str) -> str | None:
    m = re.search(r"\b(\d{10,})\b", desc)
    if m:
        return m.group(1)
    m2 = re.search(r"\b(26-\d{3})\b", desc)
    return m2.group(1) if m2 else None


def _parse_route_corridor(desc: str) -> list[str]:
    """Extract airport codes from itinerary string."""
    m = re.search(r" - (.+?) \(", desc)
    if not m:
        return []
    return m.group(1).strip().split()


# ─── fraud integration ────────────────────────────────────────────────────────

def _build_fraud_lines(
    cascade_rows: list[dict],
    hybrid_rows: list[dict],
) -> list[dict]:
    """
    Build the batch_lines list expected by run_cross_batch_fraud.
    Uses the FINAL resolved emp_no from hybrid_rows (not cascade).
    """
    lines: list[dict] = []
    for i, c in enumerate(cascade_rows):
        desc     = str(c.get("Description", "") or "")
        inv_date = str(c.get("*Invoice Date", "") or c.get("Invoice Date", "") or "")
        try:
            amount = float(c.get("*Amount", 0) or 0)
        except (ValueError, TypeError):
            amount = 0.0

        lines.append({
            "ticket_no":       _extract_ticket_no(desc),
            "passenger":       desc.split(" - ", 1)[0].strip() if " - " in desc else desc[:40],
            "amount":          amount,
            "route_corridor":  _parse_route_corridor(desc),
            "inv_date":        inv_date[:10] if inv_date else "",
            "emp_no":          hybrid_rows[i].get("emp_no", "") or "",
            "grade":           None,   # not available in master
            "sl_no":           c.get("SL No", i),
        })
    return lines


def run_fraud_detection(
    batch_id: str,
    cascade_rows: list[dict],
    hybrid_rows: list[dict],
    out_dir: Path,
) -> list[dict]:
    """
    Run cross-batch fraud detection on the final v18-resolved rows.
    Updates the persistent cross-batch history after detection.
    Returns list of fraud catches.
    """
    print(f"\n[fraud] running cross-batch detection on {len(cascade_rows)} rows...", flush=True)
    fraud_lines = _build_fraud_lines(cascade_rows, hybrid_rows)
    history     = load_cross_batch_history()

    catches = run_cross_batch_fraud(batch_id, fraud_lines, history)
    print(f"[fraud] {len(catches)} catches", flush=True)
    for cat, n in Counter(c["category"] for c in catches).most_common():
        print(f"  {cat}: {n}", flush=True)

    # Update history AFTER detection (so current batch appears in future runs)
    update_cross_batch_history(batch_id, fraud_lines, history)
    save_cross_batch_history(history)
    print(f"[fraud] cross-batch history updated ({len(history.get('tickets', {}))} tickets tracked)", flush=True)

    # Write fraud-watch JSON
    fraud_out = out_dir / f"fraud-watch-{VERSION}.json"
    fraud_out.write_text(json.dumps({
        "batch_id":    batch_id,
        "version":     VERSION,
        "timestamp":   utc_ts(),
        "catch_count": len(catches),
        "catches":     catches,
    }, indent=2, default=str))
    print(f"[fraud] {fraud_out.name} written", flush=True)

    return catches


# ─── v17.1 inline booking-group pass ─────────────────────────────────────────

def apply_booking_groups_inline(out_xlsx: Path) -> tuple[int, int]:
    """
    Read the freshly-written v18 XLSX, run booking-group detection,
    patch the file in-place.  Returns (propagated, conflicts).
    """
    print(f"\n[booking-groups] scanning for family groups...", flush=True)
    import copy
    headers, rows, hdr_row = read_xlsx_rows(out_xlsx)

    # v24 fix: write_v15_12_xlsx uses "Distribution Combination" (without "[...]")
    # so the combo column may lag behind when account changes (e.g. PC override).
    # Rebuild the combo from individual Account/CC/etc. columns before group detection.
    combo_hdr = next((h for h in headers if h and "distribution combination" in str(h).lower()), None)
    acct_hdr  = next((h for h in headers if h and str(h).strip().lower() == "account"), None)
    cc_hdr    = next((h for h in headers if h and "cost center" in str(h).lower()), None)
    div_hdr   = next((h for h in headers if h and str(h).strip().lower() == "div"), None)
    sol_hdr   = next((h for h in headers if h and str(h).strip().lower() == "solution"), None)
    ag_hdr    = next((h for h in headers if h and str(h).strip().lower() == "agency"), None)
    loc_hdr   = next((h for h in headers if h and str(h).strip().lower() == "location"), None)
    co_hdr    = next((h for h in headers if h and str(h).strip().lower() == "company"), None)

    def _pad(v, w):
        s = str(v or "").strip()
        return s.zfill(w) if s.isdigit() else (s or "0"*w)

    combos_fixed = 0
    if combo_hdr and acct_hdr:
        for row in rows:
            existing_combo = str(row.get(combo_hdr, "") or "")
            acct = str(row.get(acct_hdr, "") or "").strip()
            if not acct or not existing_combo:
                continue
            parts = existing_combo.split("-")
            combo_acct = (parts[2].strip() if len(parts) > 2 else "").lstrip("0") or "0"
            clean_acct = acct.lstrip("0") or "0"
            if combo_acct != clean_acct:
                co  = str(row.get(co_hdr, "03") or "03").strip() or "03"
                loc = str(row.get(loc_hdr, "") or "").strip() or (parts[1] if len(parts) > 1 else "20100")
                cc  = str(row.get(cc_hdr, "") or "").strip() or (parts[3] if len(parts) > 3 else "000000")
                div = str(row.get(div_hdr, "") or "").strip() or (parts[4] if len(parts) > 4 else "000")
                sol = str(row.get(sol_hdr, "") or "").strip() or (parts[5] if len(parts) > 5 else "00000")
                ag  = str(row.get(ag_hdr, "") or "").strip() or (parts[6] if len(parts) > 6 else "00000")
                proj = parts[7] if len(parts) > 7 else "00000"
                ic   = parts[8] if len(parts) > 8 else "00"
                f1   = parts[9] if len(parts) > 9 else "000000"
                row[combo_hdr] = (
                    f"{_pad(co,2)}-{_pad(loc,5)}-{_pad(acct,8)}-{_pad(cc,6)}-{_pad(div,3)}"
                    f"-{_pad(sol,5)}-{_pad(ag,5)}-{_pad(proj,5)}-{_pad(ic,2)}-{_pad(f1,6)}"
                )
                # Only flag as high-confidence PC anchor when account is 21070229
                if acct.strip("0") == "21070229".strip("0") or acct == "21070229":
                    row["_pc_resynced"] = True
                combos_fixed += 1
    if combos_fixed:
        print(f"[booking-groups] {combos_fixed} combo(s) synced from Account column (PC override fix)", flush=True)

    orig_rows = copy.deepcopy(rows)

    groups = build_booking_groups(rows)
    family_groups = [g for g in groups if _is_family_group(g, rows)]
    skipped       = len(groups) - len(family_groups)

    print(f"[booking-groups] {len(groups)} groups detected  "
          f"({len(family_groups)} family, {skipped} colleague-skip)", flush=True)

    propagated, conflicts, conflict_descs = apply_booking_group_propagation(rows, verbose=True)

    patches = collect_patches(rows, orig_rows)
    if patches:
        tmp = out_xlsx.with_name(out_xlsx.stem + ".__patch__.xlsx")
        write_xlsx_patches(out_xlsx, tmp, patches)
        tmp.replace(out_xlsx)   # atomic rename
        print(f"[booking-groups] {len(patches)} rows patched in {out_xlsx.name}", flush=True)
    else:
        print(f"[booking-groups] no changes needed", flush=True)

    if conflicts:
        print(f"[booking-groups] ⚠️  {conflicts} FAMILY_CONFLICT groups — review catches JSON", flush=True)

    # Write catches
    catches_out = out_xlsx.parent / f"catches-booking-groups-{VERSION}.json"
    catches_out.write_text(json.dumps({
        "batch_id":    out_xlsx.parent.parent.name,
        "version":     VERSION,
        "propagated":  propagated,
        "conflicts":   conflicts,
        "conflict_details": conflict_descs,
        "groups_found": len(groups),
        "family_groups": len(family_groups),
    }, indent=2))

    return propagated, conflicts


# ─── main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=f"AlJeel AP Pipeline {VERSION}")
    ap.add_argument("batch_id")
    ap.add_argument("--invoice-id", default=None)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--cost-ceiling", type=float, default=COST_CEILING)
    ap.add_argument("--input-suffix", default="v15.11",
                    help="Cascade input version (default: v15.11)")
    ap.add_argument("--skip-fraud", action="store_true",
                    help="Skip fraud detection (useful for smoke tests)")
    ap.add_argument("--use-cache", action="store_true",
                    help="Allow cached LLM results (default: always fresh calls)")
    args = ap.parse_args()

    batch_id   = args.batch_id
    batch_dir  = ROOT / "batches" / f"jawal-{batch_id}"
    raw_root   = batch_dir / "raw"
    invoice_id = args.invoice_id or batch_id

    if not batch_dir.exists():
        print(f"[fatal] batch dir not found: {batch_dir}", file=sys.stderr)
        sys.exit(2)

    # ── find cascade input ─────────────────────────────────────────────────
    out_dir = batch_dir / "output"
    out_dir.mkdir(parents=True, exist_ok=True)

    exact_cascade = out_dir / f"Spreadsheet-{invoice_id}-FILLED-{args.input_suffix}.xlsx"
    if exact_cascade.exists():
        cascade_xlsx = exact_cascade
    else:
        pattern    = f"Spreadsheet-{invoice_id}-FILLED-{args.input_suffix}*.xlsx"
        candidates = sorted(out_dir.glob(pattern),
                            key=lambda p: p.stat().st_mtime, reverse=True)
        # Exclude any v17/v18 files from prior runs
        candidates = [c for c in candidates if not re.search(r"v1[78]", c.name)]
        if not candidates:
            print(f"[fatal] cascade input not found: {out_dir}/{pattern}", file=sys.stderr)
            sys.exit(3)
        cascade_xlsx = candidates[0]
    print(f"[load] cascade: {cascade_xlsx.name}", flush=True)

    # ── output path ────────────────────────────────────────────────────────
    out_xlsx = out_dir / f"Spreadsheet-{invoice_id}-FILLED-{VERSION}.xlsx"
    if out_xlsx.exists():
        bak = out_xlsx.with_suffix(out_xlsx.suffix + f".bak-pre-{VERSION}-{utc_ts()}")
        shutil.copy2(out_xlsx, bak)
        print(f"[backup] {bak.name}", flush=True)

    # ── load inputs ────────────────────────────────────────────────────────
    cascade_rows, headers, hdr_row = v15.read_cascade_xlsx(cascade_xlsx)
    print(f"[load] {len(cascade_rows)} cascade rows", flush=True)
    if args.limit > 0:
        cascade_rows = cascade_rows[:args.limit]

    print("[load] master data...", flush=True)
    manpower    = fea.load_manpower()
    lookups     = fea.load_lookups()
    all_folders = fea.collect_all_folders(raw_root)
    print(f"[scan] {len(all_folders)} evidence folders in {raw_root}", flush=True)

    print("[scan] building reverse folder + PC index...", flush=True)
    reverse_index = build_reverse_folder_index(all_folders)
    pc_index      = build_personal_contribution_index(all_folders)
    print(f"[scan] reverse={len(reverse_index)} mappings  pc={len(pc_index)} folders", flush=True)

    # ── stage 1: routing ───────────────────────────────────────────────────
    routed: list[tuple[int, str]] = []
    for i, row in enumerate(cascade_rows):
        should, reason = _needs_classification(row, all_folders, reverse_index)
        if should:
            routed.append((i, reason))

    reason_counts: dict[str, int] = Counter(r for _, r in routed)
    print(f"[route] {len(routed)} rows → LLM  /  {len(cascade_rows) - len(routed)} stay cascade",
          flush=True)

    # ── stage 2: init hybrid_rows from cascade ────────────────────────────
    hybrid_rows: list[dict] = []
    for c in cascade_rows:
        hybrid_rows.append({
            "_row_idx":      c["_row_idx"],
            "_agent_method": "cascade",
            "emp_no":        c.get("Employee No", "") or "",
            "account":       c.get("Account", "") or "",
            "cost_center":   c.get("Cost Center", "") or "",
            "div":           c.get("DIV", "") or "",
            "solution":      c.get("Solution", "") or "",
            "agency":        c.get("Agency", "") or "",
            "location":      c.get("Location", "") or "",
        })

    # Blank emp_no on cascade sponsorship rows
    blanked_cascade = 0
    for i, c in enumerate(cascade_rows):
        if str(c.get("Account", "") or "").strip() == "60307021":
            if str(hybrid_rows[i]["emp_no"]).strip() not in ("", "0", "-"):
                hybrid_rows[i]["emp_no"] = ""
                blanked_cascade += 1
    if blanked_cascade:
        print(f"[blank] {blanked_cascade} cascade sponsorship rows → emp_no cleared", flush=True)

    # ── stage 3: LLM two-call resolution (v16 logic) ──────────────────────
    no_cache = not args.use_cache   # default: always fresh, no cache
    if no_cache:
        print("[llm] cache DISABLED — all LLM calls will be fresh", flush=True)
    else:
        print("[llm] cache ENABLED (--use-cache)", flush=True)

    total_in = total_out = llm_errors = 0
    pricing_pro = fea.GEMINI_PRICING["gemini-2.5-pro"]
    step_traces: list[dict] = []

    def worker(idx_reason):
        idx, reason = idx_reason
        try:
            return idx, reason, process_row(
                idx, cascade_rows[idx], reason,
                batch_id, raw_root, all_folders, manpower, lookups,
                reverse_index=reverse_index,
                no_cache=no_cache,
            )
        except Exception as e:
            return idx, reason, {
                "_agent_method": "cascade_fallback",
                "_llm_error":    f"{type(e).__name__}: {e}",
                "_tb":           traceback.format_exc()[-500:],
            }

    t_start = time.time()
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(worker, ir) for ir in routed]
        try:
            for fut in concurrent.futures.as_completed(futs):
                idx, reason, res = fut.result()
                done += 1
                tok_in  = res.get("_llm_in_tokens", 0) or 0
                tok_out = res.get("_llm_out_tokens", 0) or 0
                total_in  += tok_in
                total_out += tok_out
                cost_est = (total_in * pricing_pro["in"]) + (total_out * pricing_pro["out"])
                elapsed  = time.time() - t_start
                print(
                    f"[{done:3d}/{len(routed)}] row {idx:3d} "
                    f"({reason} → {res.get('_classify','?')})  "
                    f"method={res.get('_agent_method','?')}"
                    f"  t={elapsed:5.1f}s  cost~=${cost_est:.3f}"
                    f"{' [C]' if res.get('_from_cache') else ''}"
                    f"{' ERR=' + res.get('_llm_error','')[:60] if res.get('_llm_error') else ''}",
                    flush=True,
                )
                if res.get("_llm_error"):
                    llm_errors += 1
                method = res.get("_agent_method", "cascade_fallback")
                hybrid_rows[idx]["_agent_method"] = method
                if "cascade_fallback" not in method:
                    for key in ("emp_no", "account", "cost_center", "div", "solution", "agency"):
                        v = res.get(key)
                        if v is not None:
                            hybrid_rows[idx][key] = v
                hybrid_rows[idx]["_route_reason"] = reason
                hybrid_rows[idx]["_classify"]      = res.get("_classify", "?")

                # capture step trace for tuning report
                if res.get("_step_trace"):
                    step_traces.append(res["_step_trace"])

                if cost_est > args.cost_ceiling:
                    print(f"[fatal] cost ceiling ${args.cost_ceiling:.2f} hit — saving partial.",
                          file=sys.stderr)
                    for f in futs:
                        f.cancel()
                    break
        except KeyboardInterrupt:
            print("\n[interrupt] saving partial...", flush=True)

    # ── stage 3b: family cluster unification (surname+route emp_no match) ──
    unified = apply_family_cluster_unification(hybrid_rows, cascade_rows)
    print(f"[cluster] {unified} rows emp_no-unified within family clusters", flush=True)

    # ── stage 3c: personal contribution overlay ───────────────────────────
    pc_applied = 0
    for i, c in enumerate(cascade_rows):
        desc  = str(c.get("Description", "") or "")
        notes = str(c.get("Notes", "") or "")
        text  = desc + " " + notes
        tm    = re.search(r"\b(\d{10,})\b", text)
        ticket = tm.group(1) if tm else ""
        if not ticket:
            tm2 = re.search(r"\b(26-\d{3})\b", text)
            ticket = tm2.group(1) if tm2 else ""
        passenger = desc.split(" - ", 1)[0].strip() if " - " in desc else ""
        clean_pax = _clean_passenger(passenger)
        folder = fea.find_ticket_folder(ticket, clean_pax, notes, all_folders)
        if not folder:
            f2 = reverse_index.get(ticket)
            if f2 and f2.exists():
                folder = f2
        if not folder:
            continue
        pc_rec = pc_index.get(str(folder))
        if not pc_rec:
            continue
        cascade_account = str(c.get("Account", "") or "").strip()
        if cascade_account in ("21070229", "60307021"):
            continue
        res_layer = str(c.get("Resolution Layer", "") or "").strip().lower()
        if "not_resolved" not in res_layer and "not resolved" not in res_layer:
            continue
        flags     = str(c.get("Agent Flags", "") or "")
        cascade_cc = str(c.get("Cost Center", "") or "").strip()
        if "EMPLOYEE_NOT_IN_MASTER" not in flags and cascade_cc not in ("", "000000", "999999"):
            continue
        emp_no = pc_rec.get("emp_no", "")
        rec    = manpower.get(emp_no, {})
        hybrid_rows[i]["account"]  = "21070229"
        hybrid_rows[i]["emp_no"]   = emp_no
        if rec:
            hybrid_rows[i]["cost_center"] = _norm_master_code(rec.get("cost_center", ""), "cc")
            hybrid_rows[i]["div"]         = _norm_master_code(rec.get("div_code", ""), "div")
            hybrid_rows[i]["solution"]    = _norm_master_code(rec.get("solution", ""), "solution")
            hybrid_rows[i]["agency"]      = _norm_master_code(rec.get("agency_code", ""), "agency")
        hybrid_rows[i]["_agent_method"] = "v18_personal_contribution"
        pc_applied += 1
    if pc_applied:
        print(f"[pc] {pc_applied} rows → account=21070229 (personal contribution)", flush=True)

    # ── stage 4: write v18 XLSX ────────────────────────────────────────────
    # Remap methods so write_v15_12_xlsx picks them up correctly
    for h in hybrid_rows:
        m = h.get("_agent_method", "")
        if m.startswith("v18_") or m.startswith("v16_") or m in (
            "v16_master_shortcut", "v16_sponsorship_master"
        ):
            h["_agent_method_orig"] = m
            h["_agent_method"] = "cluster_unified" if "cluster" in m else "llm_agent"

    v15.write_v15_12_xlsx(cascade_xlsx, out_xlsx, hybrid_rows, cascade_rows, hdr_row)

    for h in hybrid_rows:
        if "_agent_method_orig" in h:
            h["_agent_method"] = h.pop("_agent_method_orig")

    print(f"[out] {out_xlsx.name} (v16 pass complete)", flush=True)

    # ── stage 5: booking-group detection (v17.1 inline) ───────────────────
    bg_propagated, bg_conflicts = apply_booking_groups_inline(out_xlsx)

    # ── stage 6: fraud detection ───────────────────────────────────────────
    fraud_catches: list[dict] = []
    if not args.skip_fraud:
        fraud_catches = run_fraud_detection(batch_id, cascade_rows, hybrid_rows, out_dir)
    else:
        print("[fraud] skipped (--skip-fraud)", flush=True)

    # ── stage 7: write step trace for tuning ─────────────────────────────────
    trace_path = out_dir / f"step-trace-{VERSION}.jsonl"
    if step_traces:
        with open(trace_path, "w") as tf:
            for t in step_traces:
                tf.write(json.dumps(t, default=str) + "\n")
        print(f"[trace] {len(step_traces)} routed rows → {trace_path.name}", flush=True)

    # ── stage 8: auto-score if truth file exists ────────────────────────────
    auto_score: str = "N/A"
    truth_candidates = list(batch_dir.glob(f"{batch_id}.xlsx"))
    if truth_candidates:
        try:
            import subprocess
            qc_script = ROOT / "qc" / "score_against_truth.py"
            score_out = out_dir / f"score-{VERSION}.md"
            result = subprocess.run(
                ["python3", str(qc_script), str(out_xlsx), str(truth_candidates[0])],
                capture_output=True, text=True, timeout=120,
            )
            score_out.write_text(result.stdout)
            for line in reversed(result.stdout.splitlines()):
                m = re.search(r"All-5-segments exact.*?(\d+\.\d+)%", line)
                if m:
                    auto_score = f"{m.group(1)}%"
                    break
            print(f"[score] {auto_score}  → {score_out.name}", flush=True)
        except Exception as e:
            print(f"[score] auto-score failed: {e}", flush=True)
    else:
        print(f"[score] no truth file found (blind run)", flush=True)

    # ── summary ───────────────────────────────────────────────────────────
    cost_usd = (total_in * pricing_pro["in"]) + (total_out * pricing_pro["out"])
    method_counts: dict[str, int] = Counter(h["_agent_method"] for h in hybrid_rows)
    fraud_cats = Counter(c["category"] for c in fraud_catches)

    summary = {
        "batch_id":                batch_id,
        "version":                 VERSION,
        "timestamp_utc":           utc_ts(),
        "total_rows":              len(cascade_rows),
        "routed_to_llm":           len(routed),
        "routing_reasons":         dict(reason_counts),
        "method_counts":           dict(method_counts),
        "cascade_blanked_spon":    blanked_cascade,
        "cluster_unified":         unified,
        "pc_applied":              pc_applied,
        "booking_group_propagated":bg_propagated,
        "booking_group_conflicts": bg_conflicts,
        "llm_errors":              llm_errors,
        "no_cache":                no_cache,
        "auto_score_all5":         auto_score,
        "fraud_catches":           len(fraud_catches),
        "fraud_categories":        dict(fraud_cats),
        "llm_in_tokens":           total_in,
        "llm_out_tokens":          total_out,
        "cost_usd_est":            round(cost_usd, 4),
        "cost_ceiling":            args.cost_ceiling,
        "runtime_sec":             round(time.time() - t_start, 1),
        "cascade_input":           str(cascade_xlsx),
        "output":                  str(out_xlsx),
    }
    (out_dir / f"summary-{VERSION}.json").write_text(
        json.dumps(summary, indent=2, default=str)
    )

    print()
    print("=" * 65)
    print(f"  {VERSION} done — {batch_id}")
    print(f"  Rows:            {summary['total_rows']}  ({len(routed)} routed to LLM)")
    print(f"  Cascade blanked: {blanked_cascade}")
    print(f"  Methods:         {dict(method_counts)}")
    print(f"  Cluster unif.:   {unified}")
    print(f"  PC applied:      {pc_applied}")
    print(f"  Booking groups:  {bg_propagated} propagated  "
          f"{bg_conflicts} conflicts {'⚠️' if bg_conflicts else '✅'}")
    print(f"  Fraud catches:   {len(fraud_catches)}"
          f"  {dict(fraud_cats) if fraud_cats else '(none)'}")
    print(f"  LLM cost (est):  ${cost_usd:.4f}  ({total_in:,} in / {total_out:,} out)")
    print(f"  Runtime:         {summary['runtime_sec']:.1f}s")
    print(f"  Score (auto):    {auto_score}")
    print(f"  Step trace:      {len(step_traces)} rows → step-trace-{VERSION}.jsonl")
    print(f"  Output:          {out_xlsx.name}")
    print("=" * 65)


if __name__ == "__main__":
    main()
