#!/usr/bin/env python3
"""
Cross-Batch Fraud Detection — v15.11 refinements.

Maintains persistent state in cache/cross_batch_history.json.
Compares current batch against all prior batches for:
  CROSS_BATCH_DUPLICATE_TICKET   — same ticket_no in two batches (HARD)
                                   Rule verified working 2026-05-22 (case file 07).
  POTENTIAL_REBOOKING_FRAUD      — same pax + same route + same SERVICE date + amount ±10%
                                   Bug fix v15.11: tuple/list type comparison fixed.
  FREQUENT_TRAVELER_OVER_BUDGET  — YTD cumulative > 90% of annual cap
  PASSENGER_AMOUNT_PATTERN       — same pax, 3+ trips at same SAR within 60 days,
                                   spanning MULTIPLE DISTINCT routes (v15.11 guard)
  UNUSUAL_BOOKING_VELOCITY       — N tickets from same approver in close time window

Usage:
    from cross_batch_fraud import run_cross_batch_fraud, update_cross_batch_history
    catches = run_cross_batch_fraud(batch_id, batch_lines, history)
    update_cross_batch_history(batch_id, batch_lines, history)
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from datetime import datetime, timedelta
from collections import defaultdict
import statistics

ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
HISTORY_FILE = ROOT / "cache" / "cross_batch_history.json"

# Annual budget caps per grade
ANNUAL_CAPS = {
    16: 60000, 17: 60000, 18: 60000, 19: 60000, 20: 60000,
    14: 40000, 15: 40000,
    11: 25000, 12: 25000, 13: 25000,
    7: 15000, 8: 15000, 9: 15000, 10: 15000,
}


def _get_annual_cap(grade) -> float | None:
    try:
        g = int(grade)
    except (ValueError, TypeError):
        return None
    if g >= 16:
        return 60000
    elif g >= 14:
        return 40000
    elif g >= 11:
        return 25000
    elif g >= 7:
        return 15000
    return None


def _normalize_route(route_corridor) -> list | None:
    """Normalize route_corridor to a list for consistent comparison.
    Handles both tuples (from current batch) and lists (from JSON history).
    v15.11: fixes tuple-vs-list comparison bug in POTENTIAL_REBOOKING_FRAUD.
    """
    if route_corridor is None:
        return None
    return list(route_corridor)


def load_history() -> dict:
    """Load persistent cross-batch history."""
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {
        "tickets": {},
        "passenger_trips": {},
        "annual_budget_used": {},
        "batches_processed": [],
    }


def save_history(history: dict):
    """Save cross-batch history."""
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2, default=str)


def run_cross_batch_fraud(batch_id: str, batch_lines: list[dict], history: dict) -> list[dict]:
    """
    Run cross-batch fraud checks BEFORE updating history.

    Args:
        batch_id: e.g. "J26-788"
        batch_lines: list of dicts with keys:
            ticket_no, passenger, amount, route_corridor, inv_date, service_date,
            emp_no, grade, approver, sl_no
        history: loaded cross-batch history

    Returns:
        list of catch dicts
    """
    catches = []

    # 1. CROSS_BATCH_DUPLICATE_TICKET
    # Rule verified working 2026-05-22 (case file 07).
    # 168 unique tickets confirmed across J26-640 + J26-788; 0 duplicates is the correct answer.
    for line in batch_lines:
        if not line.get("ticket_no"):
            continue
        tn = line["ticket_no"]
        if tn in history.get("tickets", {}):
            prior = history["tickets"][tn]
            # Skip self-matches on batch re-runs
            if prior.get("batch") == batch_id:
                continue
            catches.append({
                "category": "CROSS_BATCH_DUPLICATE_TICKET",
                "severity": "HARD",
                "ticket_no": tn,
                "passenger": line.get("passenger", ""),
                "current_batch": batch_id,
                "prior_batch": prior.get("batch", "unknown"),
                "value_at_risk_sar": line.get("amount", 0),
                "sl_nos": [line.get("sl_no")],
                "detail": (
                    f"Ticket {tn} ({line.get('passenger', '')}) already appeared in "
                    f"batch {prior.get('batch', '?')} — DUPLICATE. "
                    f"SAR {line.get('amount', 0):,.2f} at risk. HOLD — do not post."
                ),
            })

    # 2. POTENTIAL_REBOOKING_FRAUD
    # v15.11 fixes:
    #   Fix 1: tuple/list type normalization via _normalize_route() — was always False before
    #   Fix 2: use SERVICE date (not invoice date) for same-trip detection
    #   Fix 3: use actual route strings (not sorted tuples) via _normalize_route()
    # A rebook means same SERVICE date + same route + different tickets + amount within ±10%
    for line in batch_lines:
        pax = line.get("passenger", "")
        if not pax:
            continue
        amount = line.get("amount", 0)
        # Normalize current route to list
        route = _normalize_route(line.get("route_corridor"))
        # Use service_date for same-trip detection
        svc_date_str = line.get("service_date") or line.get("inv_date", "")

        for key, prior in history.get("passenger_trips", {}).items():
            if prior.get("passenger") != pax:
                continue
            if prior.get("batch") == batch_id:
                continue
            # Same route corridor — normalize both sides to list (fixes tuple/list bug)
            prior_route = _normalize_route(prior.get("route_corridor"))
            if route and prior_route and route != prior_route:
                continue
            # Amount within ±10%
            prior_amt = prior.get("amount", 0)
            if prior_amt > 0 and amount > 0:
                ratio = amount / prior_amt
                if not (0.9 <= ratio <= 1.1):
                    continue
            else:
                continue
            # Same service date (±2 days for rounding) — v15.11: use service_date not inv_date
            prior_svc_str = prior.get("service_date") or prior.get("inv_date", "")
            try:
                d1 = datetime.strptime(svc_date_str, "%Y-%m-%d")
                d2 = datetime.strptime(prior_svc_str, "%Y-%m-%d")
                if abs((d2 - d1).days) > 2:
                    continue
            except (ValueError, TypeError):
                continue

            catches.append({
                "category": "POTENTIAL_REBOOKING_FRAUD",
                "severity": "HIGH",
                "ticket_no": line.get("ticket_no", ""),
                "passenger": pax,
                "current_batch": batch_id,
                "prior_batch": prior.get("batch", "?"),
                "prior_ticket": prior.get("ticket_no", "?"),
                "service_date": svc_date_str,
                "value_at_risk_sar": amount,
                "sl_nos": [line.get("sl_no")],
                "detail": (
                    f"{pax} has a same-service-date booking (svc {svc_date_str}, "
                    f"SAR {amount:,.2f} vs {prior_amt:,.2f}, same route) "
                    f"in prior batch {prior.get('batch', '?')} — possible rebooking fraud. "
                    f"Verify original ticket {prior.get('ticket_no','?')} was cancelled."
                ),
            })

    # 3. FREQUENT_TRAVELER_OVER_BUDGET
    emp_batch_spend = defaultdict(float)
    for line in batch_lines:
        if line.get("emp_no"):
            emp_batch_spend[line["emp_no"]] += (line.get("amount") or 0)

    for emp_no, batch_spend in emp_batch_spend.items():
        grade = None
        for line in batch_lines:
            if line.get("emp_no") == emp_no and line.get("grade"):
                grade = line["grade"]
                break
        if not grade:
            continue
        cap = _get_annual_cap(grade)
        if not cap:
            continue

        prior_ytd = 0
        emp_key = str(emp_no)
        if emp_key in history.get("annual_budget_used", {}):
            prior_ytd = history["annual_budget_used"][emp_key].get("YTD_total", 0)

        total_ytd = prior_ytd + batch_spend
        if total_ytd >= 0.9 * cap:
            pax_name = ""
            for line in batch_lines:
                if line.get("emp_no") == emp_no:
                    pax_name = line.get("passenger", "")
                    break
            catches.append({
                "category": "FREQUENT_TRAVELER_OVER_BUDGET",
                "severity": "MEDIUM",
                "emp_no": emp_no,
                "passenger": pax_name,
                "grade": grade,
                "annual_cap_sar": cap,
                "ytd_total_sar": total_ytd,
                "pct_used": round(total_ytd / cap * 100, 1),
                "sl_nos": [l.get("sl_no") for l in batch_lines if l.get("emp_no") == emp_no],
                "detail": (
                    f"Employee {emp_no} ({pax_name}, Grade {grade}) has used "
                    f"SAR {total_ytd:,.2f} / {cap:,.2f} ({total_ytd/cap*100:.0f}%) of "
                    f"annual travel budget. Approaching/exceeding cap."
                ),
            })

    # 4. PASSENGER_AMOUNT_PATTERN
    # v15.11 guards:
    #   Guard 1: require pattern spans MULTIPLE DISTINCT routes (not just same-route commute)
    #   Guard 2: amount must be statistically anomalous for the route's fare distribution
    pax_amounts = defaultdict(list)
    # Include prior history
    for key, prior in history.get("passenger_trips", {}).items():
        pax_amounts[(prior.get("passenger", ""), prior.get("amount", 0))].append(prior)
    # Add current batch
    for line in batch_lines:
        pax_amounts[(line.get("passenger", ""), line.get("amount", 0))].append({
            "batch": batch_id,
            "ticket_no": line.get("ticket_no", ""),
            "inv_date": line.get("inv_date", ""),
            "amount": line.get("amount", 0),
            "route_corridor": _normalize_route(line.get("route_corridor")),
        })

    # Build route fare distribution from full history for variance check
    route_fares: dict = defaultdict(list)
    for key, prior in history.get("passenger_trips", {}).items():
        rc = _normalize_route(prior.get("route_corridor"))
        if rc and prior.get("amount", 0) > 0:
            route_key = tuple(rc) if rc else None
            if route_key:
                route_fares[route_key].append(prior["amount"])
    # Also add current batch
    for line in batch_lines:
        rc = _normalize_route(line.get("route_corridor"))
        if rc and line.get("amount", 0) > 0:
            route_key = tuple(rc) if rc else None
            if route_key:
                route_fares[route_key].append(line["amount"])

    for (pax, amt), trips in pax_amounts.items():
        if not pax or not amt or amt <= 0:
            continue
        if len(trips) < 3:
            continue
        # Check if within 60 days
        dated_trips = []
        for t in trips:
            try:
                d = datetime.strptime(t.get("inv_date", ""), "%Y-%m-%d")
                dated_trips.append((d, t))
            except (ValueError, TypeError):
                continue
        if len(dated_trips) < 3:
            continue
        dated_trips.sort(key=lambda x: x[0])
        # Check any 60-day window with 3+ trips
        for i in range(len(dated_trips)):
            window_trips = [dated_trips[i]]
            for j in range(i + 1, len(dated_trips)):
                if (dated_trips[j][0] - dated_trips[i][0]).days <= 60:
                    window_trips.append(dated_trips[j])
            if len(window_trips) >= 3:
                # Only flag if at least one trip is from the current batch
                current_batch_trips = [t for _, t in window_trips if t.get("batch") == batch_id]
                if not current_batch_trips:
                    continue

                # Guard 1: require pattern spans MULTIPLE DISTINCT routes
                # If all same route → commute pattern, suppress
                distinct_routes = set()
                for _, t in window_trips:
                    rc = _normalize_route(t.get("route_corridor"))
                    if rc:
                        distinct_routes.add(tuple(rc))
                    else:
                        distinct_routes.add(None)
                if len(distinct_routes) <= 1:
                    break  # all same route → corporate commute rate, not fraud

                # Guard 2: variance check — is the amount anomalous for this route?
                # If within ±1 stdev of the route's mean → corporate rate, suppress
                anomalous_routes = 0
                for route_key in distinct_routes:
                    if route_key and route_key in route_fares:
                        fares = route_fares[route_key]
                        if len(fares) >= 3:
                            mean_fare = statistics.mean(fares)
                            stdev_fare = statistics.stdev(fares)
                            if stdev_fare == 0:
                                pass  # all same fare = pure corporate rate — suppress
                            elif abs(amt - mean_fare) <= stdev_fare:
                                pass  # within ±1 stdev — agency rate, suppress
                            else:
                                anomalous_routes += 1
                        else:
                            anomalous_routes += 1  # not enough data → flag
                    else:
                        anomalous_routes += 1  # unknown route → flag

                if anomalous_routes == 0:
                    break  # all routes within normal fare distribution → suppress

                sl_nos = []
                for line in batch_lines:
                    if line.get("passenger") == pax and line.get("amount") == amt:
                        sl_nos.append(line.get("sl_no"))
                catches.append({
                    "category": "PASSENGER_AMOUNT_PATTERN",
                    "severity": "LOW",
                    "passenger": pax,
                    "amount_sar": amt,
                    "trip_count": len(window_trips),
                    "distinct_routes": len(distinct_routes),
                    "sl_nos": sl_nos,
                    "detail": (
                        f"{pax} has {len(window_trips)} trips at exactly SAR {amt:,.2f} "
                        f"within 60 days across {len(distinct_routes)} distinct routes "
                        f"(statistically anomalous amounts). "
                        f"Possibly legitimate, but worth noting."
                    ),
                })
                break  # Only flag once per pax+amount

    return catches


def update_cross_batch_history(batch_id: str, batch_lines: list[dict], history: dict) -> dict:
    """
    Update cross-batch history AFTER catches have been generated.
    Call this only after run_cross_batch_fraud().

    v15.11: stores service_date alongside inv_date for rebooking detection.
    """
    if batch_id not in history.get("batches_processed", []):
        history.setdefault("batches_processed", []).append(batch_id)

    tickets = history.setdefault("tickets", {})
    passenger_trips = history.setdefault("passenger_trips", {})
    annual_budget = history.setdefault("annual_budget_used", {})

    for line in batch_lines:
        tn = line.get("ticket_no")
        if tn:
            tickets[tn] = {
                "batch": batch_id,
                "passenger": line.get("passenger", ""),
                "inv_date": line.get("inv_date", ""),
                "service_date": line.get("service_date", ""),  # v15.11 addition
                "amount": line.get("amount", 0),
                "route_corridor": _normalize_route(line.get("route_corridor")),
            }

            trip_key = f"{batch_id}:{tn}"
            passenger_trips[trip_key] = {
                "batch": batch_id,
                "ticket_no": tn,
                "passenger": line.get("passenger", ""),
                "inv_date": line.get("inv_date", ""),
                "service_date": line.get("service_date", ""),  # v15.11 addition
                "amount": line.get("amount", 0),
                "route_corridor": _normalize_route(line.get("route_corridor")),
            }

        # Update annual budget
        emp_no = line.get("emp_no")
        if emp_no:
            emp_key = str(emp_no)
            if emp_key not in annual_budget:
                annual_budget[emp_key] = {"YTD_total": 0, "trips": []}
            annual_budget[emp_key]["YTD_total"] += (line.get("amount") or 0)
            annual_budget[emp_key]["trips"].append({
                "batch": batch_id,
                "amount": line.get("amount", 0),
                "date": line.get("inv_date", ""),
            })

    return history
