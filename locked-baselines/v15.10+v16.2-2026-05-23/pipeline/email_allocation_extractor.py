#!/usr/bin/env python3
"""
email_allocation_extractor.py — Layer 7.7 LLM Email Allocation Extractor v14.1

For lines where standard resolution fails (REVERSE_MANAGER_NO_MAJORITY,
not_found, etc.), read the .msg email chain and ask an LLM to extract
any EXPLICIT allocation (Person Number, cost center, etc.).

Strategy:
1. Find .msg files for the ticket via raw_dir
2. Parse full forwarded chain body + PDF attachment text
3. Call Gemini 2.5 Pro (fallback: Claude Sonnet via LiteLLM proxy)
4. Cache results by .msg SHA256 hash to avoid repeat calls
5. Return structured AllocationExtractResult

Cache: extracted/allocation-llm-email-cache/<sha256>.json
Cost: ~$0.001 per .msg (Gemini 2.5 Pro, ~2K input tokens)
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

CACHE_DIR = Path("/home/clawdbot/.openclaw/workspace/aljeel/extracted/allocation-llm-email-cache")

# ── LLM prompt ──────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = """You are analyzing an AlJeel Medical Company approval email chain for a travel expense.
Your job is to extract the EXPLICIT GL allocation — the coding that tells AlJeel Finance which employee,
cost center, division, agency, or solution to charge for this travel.

Email subject: {subject}
Email body + attachments:
---
{body}
---

Rules (READ CAREFULLY):
1. allocation_found=true ONLY when the email contains an EXPLICIT, NAMED coding instruction such as:
   - A Person Number (7-8 digit employee number)
   - An explicit cost center code (e.g. 160014, 160011, 250010)
   - An explicit division code + cost center together
   - A name + employee number pair that clearly says "charge to this person"
2. "يعتمد" stamps alone are NOT an allocation — they mean APPROVAL, not coding.
3. A name signature at the bottom is NOT an allocation.
4. "Personal Contribution" in the subject is the Workday MODULE name, NOT a personal trip signal.
5. Generic approval phrases ("approved", "please proceed") are NOT allocations.
6. If you see an Oracle Fusion form with a filled "Person Number" or "Cost Center" field, that IS an allocation.

Output ONLY valid JSON:
{{
  "allocation_found": true or false,
  "person_number": "<7-8 digit emp no or null>",
  "cost_center": "<6-digit code or null>",
  "division": "<3-digit code or null>",
  "agency": "<5-digit code or null>",
  "solution": "<5-digit code or null>",
  "source_field": "<verbatim quote from the email/form that contains this allocation>",
  "confidence": "high" or "medium" or "low",
  "notes": "<brief explanation; if allocation_found=false, say exactly why — e.g. 'only يعتمد stamp, no Person Number'>"
}}

CRITICAL -- DO NOT RETURN ORACLE FUSION INTERNAL IDs:  # Fix F v15.1: JSON closed before CRITICAL section

Oracle Fusion forms contain fields that look like GL codes but are actually
internal HCM database IDs. Specifically:

- "Trip Cost For" field with a 13-15 digit value (e.g. 300000753019378)
  is an Oracle HCM internal cost-center ID, NOT an AlJeel GL cost center.
  AlJeel GL cost centers are 6-digit numeric (e.g. 160013, 160014, 250010).
  If you see only an Oracle HCM ID with no 6-digit code, return cost_center: null.

- "Person Number" is a valid employee ID (4-7 digits, e.g. 1002576). Always
  return this when present.

- "Division", "Agency", "Solution" fields in Oracle Fusion forms may contain
  Oracle HCM lookup IDs (5-digit, e.g. 60008, 60338, 60015). These are NOT
  AlJeel GL coding. AlJeel uses:
    * Division: 3 digits (e.g. 192, 194, 196, 170)
    * Agency: 5 digits matching the Agency sheet of Aljeel_Lookups (e.g. 10072, 10081)
    * Solution: 5 digits matching the Solution sheet (e.g. 00000, 10017, 10050)
  If a Fusion field value does not match the expected AlJeel coding format,
  return that field as null and set allocation_found: false unless a Person
  Number is present.

- "يعتمد" (Arabic "approved") stamp alone is NOT an allocation. Return
  allocation_found: false if only يعتمد stamp + traveler name are present.

ONLY return allocation_found: true when you can identify either:
  (a) a valid 4-7 digit AlJeel Person Number, OR
  (b) explicit AlJeel-format GL codes (6-digit CC, 3-digit DIV, etc.)

When in doubt, return allocation_found: false with explanation in notes."""


@dataclass
class AllocationExtractResult:
    """Result from LLM extraction of allocation from .msg."""
    allocation_found: bool
    person_number: Optional[str] = None
    cost_center: Optional[str] = None
    division: Optional[str] = None
    agency: Optional[str] = None
    solution: Optional[str] = None
    source_field: Optional[str] = None
    confidence: str = "low"   # "high" | "medium" | "low"
    notes: str = ""
    msg_file: Optional[str] = None   # which .msg this came from
    llm_provider: str = ""           # "gemini" | "litellm"
    from_cache: bool = False


# ── helpers ────────────────────────────────────────────────────────────────

def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_env_key(name: str) -> str:
    val = os.environ.get(name, "")
    if not val:
        env_path = Path("/home/clawdbot/.openclaw/.env")
        if env_path.exists():
            for line in env_path.read_text(errors="replace").splitlines():
                if line.startswith(f"{name}="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    return val


# Fix 5 v15: Gemini 3 Pro primary, 2.5 Pro fallback, Sonnet last-resort
_GEMINI_MODEL_CASCADE = ["gemini-pro-latest", "gemini-2.5-pro"]  # Fix A v15.1: gemini-3-pro 404; gemini-pro-latest resolves to best available


def _call_gemini_model(prompt_text: str, api_key: str, model: str) -> Optional[dict]:
    """Call a specific Gemini model via Google API and return parsed JSON result."""
    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt_text}]}],
        "generationConfig": {
            "temperature": 0.05,
            "maxOutputTokens": 16384,  # Fix C v15.1: Gemini 3.x uses 90+ thinking tokens; 4096 hit MAX_TOKENS
            "responseMimeType": "application/json",
        },
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read())
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    # Fix A v15.1: capture modelVersion for logging
    model_version = (data.get("modelVersion") or
                     (data.get("candidates") or [{}])[0].get("modelVersion", ""))
    if model_version:
        import sys as _sys_mv; _sys_mv.stderr.write(f"[extractor] modelVersion={model_version!r} model={model!r}\n")
        print(f"[email_allocation_extractor] modelVersion={model_version}", flush=True)
    # Strip any markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    text = re.sub(r"\s*```$", "", text)
    # Ensure proper JSON object
    stripped = text.strip()
    if not stripped.startswith("{"):
        m = re.search(r"\{.*\}", stripped, re.DOTALL)
        if m:
            stripped = m.group()
        else:
            raise ValueError(f"No JSON object in response: {stripped[:80]!r}")
    result = json.loads(stripped)
    result["_model_version"] = model_version
    return result


def _call_gemini(prompt_text: str, api_key: str) -> Optional[dict]:
    """Try Gemini 3 Pro then 2.5 Pro, return parsed JSON result. Fix 5 v15."""
    for model in _GEMINI_MODEL_CASCADE:
        try:
            result = _call_gemini_model(prompt_text, api_key, model)
            if result is not None:
                # Tag which model actually answered
                result["_gemini_model_used"] = model
                print(f"[email_allocation_extractor] Gemini model used: {model}")
                return result
        except Exception as exc:
            import urllib.error
            # 503 / 429 / 5xx: try next model in cascade
            is_transient = (
                isinstance(exc, urllib.error.HTTPError) and exc.code in (404, 429, 500, 502, 503, 504)  # Fix B v15.1: 404=model deprecated
                or "503" in str(exc) or "429" in str(exc)
                or "not found" in str(exc).lower() or "NOT_FOUND" in str(exc)  # Fix B v15.1
            )
            if is_transient:
                print(f"[email_allocation_extractor] {model} returned {exc} -- trying next model in cascade")
                continue
            else:
                # Hard error (bad key, malformed response) -- don't try next model
                raise
    raise RuntimeError(f"All Gemini models in cascade failed: {_GEMINI_MODEL_CASCADE}")


def _call_litellm(prompt_text: str, api_key: str, base_url: str) -> Optional[dict]:
    """Call Claude Sonnet via LiteLLM proxy and return parsed JSON result."""
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": "anthropic/claude-sonnet-4-6",
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an AP allocation analyst. Always output ONLY valid JSON. "
                    "No markdown, no explanation outside JSON."
                ),
            },
            {"role": "user", "content": prompt_text},
        ],
        "temperature": 0.05,
        "max_tokens": 4096,  # bumped from 512 -- full JSON response for complex chains
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    text = data["choices"][0]["message"]["content"].strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    stripped = text.strip()
    if not stripped.startswith("{"):
        m = re.search(r"\{.*\}", stripped, re.DOTALL)
        if m:
            stripped = m.group()
        else:
            raise ValueError(f"No JSON object in litellm response: {stripped[:80]!r}")
    return json.loads(stripped)


def _call_llm(prompt_text: str) -> tuple[Optional[dict], str]:
    """Try Gemini 2.5 Pro first, fall back to LiteLLM (Claude Sonnet)."""
    gemini_key = _load_env_key("GEMINI_API_KEY")
    if gemini_key:
        try:
            result = _call_gemini(prompt_text, gemini_key)
            if result is not None:
                return result, "gemini"
        except Exception as exc:
            print(f"[email_allocation_extractor] Gemini failed: {exc}. Falling back to LiteLLM.")

    litellm_key = _load_env_key("LITELLM_API_KEY") or _load_env_key("ANTHROPIC_API_KEY")
    litellm_url = _load_env_key("ANTHROPIC_BASE_URL") or "http://143.198.136.126:4000"
    if litellm_key and litellm_url:
        try:
            result = _call_litellm(prompt_text, litellm_key, litellm_url)
            if result is not None:
                return result, "litellm"
        except Exception as exc:
            print(f"[email_allocation_extractor] LiteLLM failed: {exc}.")

    return None, ""


# ── PDF attachment text from cache ─────────────────────────────────────────

def _get_pdf_text(msg_dir: Path) -> str:
    """Retrieve extracted PDF text from the msg-cache for any PDFs in the same ticket folder."""
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    try:
        from msg_parser import CACHE_DIR as MSG_CACHE_DIR
    except ImportError:
        MSG_CACHE_DIR = Path("/home/clawdbot/.openclaw/workspace/aljeel/extracted/msg-cache")

    texts = []
    if msg_dir.is_dir():
        for pdf in msg_dir.glob("*.pdf"):
            # Try opex_pdf_parser cache first
            opex_cache = Path("/home/clawdbot/.openclaw/workspace/aljeel/extracted/opex-pdf-cache")
            h = hashlib.sha256(pdf.read_bytes()).hexdigest()
            opex_hit = opex_cache / f"{h}.json"
            if opex_hit.exists():
                try:
                    d = json.loads(opex_hit.read_text())
                    txt = d.get("text", "") or d.get("body_text", "")
                    if txt:
                        texts.append(f"[PDF: {pdf.name}]\n{txt}")
                        continue
                except Exception:
                    pass
            # Fallback: try pymupdf
            try:
                import fitz  # PyMuPDF
                doc = fitz.open(str(pdf))
                pg_texts = [doc[i].get_text() for i in range(min(3, len(doc)))]
                combined = "\n".join(pg_texts).strip()
                if combined:
                    texts.append(f"[PDF: {pdf.name}]\n{combined}")
            except Exception:
                pass

    return "\n\n".join(texts)


# ── main extraction function ────────────────────────────────────────────────

def extract_allocation_from_msg(msg_path: Path) -> AllocationExtractResult:
    """
    Extract GL allocation from a single .msg file using an LLM.
    Results are cached by file SHA256 to avoid redundant API calls.

    Returns AllocationExtractResult (allocation_found may be False if email
    only contains approval stamps without explicit coding).
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    sha = _sha256_file(msg_path)
    cache_file = CACHE_DIR / f"{sha}.json"

    # Cache hit
    if cache_file.exists():
        try:
            d = json.loads(cache_file.read_text())
            return AllocationExtractResult(
                allocation_found=d.get("allocation_found", False),
                person_number=d.get("person_number"),
                cost_center=d.get("cost_center"),
                division=d.get("division"),
                agency=d.get("agency"),
                solution=d.get("solution"),
                source_field=d.get("source_field"),
                confidence=d.get("confidence", "low"),
                notes=d.get("notes", ""),
                msg_file=str(msg_path),
                llm_provider=d.get("llm_provider", ""),
                from_cache=True,
            )
        except Exception:
            pass

    # Parse .msg
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from msg_parser import parse_msg

    parsed = parse_msg(msg_path)
    subject = parsed.get("subject", "") or ""
    body = parsed.get("body_text", "") or ""

    # Append PDF text from same folder
    pdf_text = _get_pdf_text(msg_path.parent)

    # Send full content — Gemini 2.5 Flash has 1M token context. No truncation.
    # Fields like Person Number / Cost Center sit 4000+ chars deep in forwarded chains.
    # Token guard: if >1.8M chars (~500K tokens), log warning but never cap.
    full_content = body
    if pdf_text:
        full_content += f"\n\n{pdf_text}"

    prompt = EXTRACTION_PROMPT.format(
        subject=subject,
        body=full_content,
    )

    llm_result, provider = _call_llm(prompt)

    if llm_result is None:
        result_dict = {
            "allocation_found": False,
            "notes": "LLM call failed; email not analyzed",
            "confidence": "low",
            "llm_provider": "",
        }
    else:
        # Normalize LLM output
        def _clean(v):
            if v in (None, "null", "NULL", "", "None"):
                return None
            return str(v).strip()

        result_dict = {
            "allocation_found": bool(llm_result.get("allocation_found", False)),
            "person_number": _clean(llm_result.get("person_number")),
            "cost_center": _clean(llm_result.get("cost_center")),
            "division": _clean(llm_result.get("division")),
            "agency": _clean(llm_result.get("agency")),
            "solution": _clean(llm_result.get("solution")),
            "source_field": _clean(llm_result.get("source_field")),
            "confidence": llm_result.get("confidence", "low"),
            "notes": llm_result.get("notes", ""),
            "llm_provider": provider,
        }

    # Write cache
    try:
        cache_file.write_text(json.dumps(result_dict, ensure_ascii=False, indent=2))
    except Exception:
        pass

    return AllocationExtractResult(
        msg_file=str(msg_path),
        from_cache=False,
        **{k: v for k, v in result_dict.items() if k != "llm_provider"},
        llm_provider=result_dict.get("llm_provider", ""),
    )


def extract_allocation_for_ticket(
    ticket_no: Optional[str],
    raw_dir: Optional[Path],
) -> Optional[AllocationExtractResult]:
    """
    Find all .msg files for a ticket, run LLM extraction on each,
    and return the best result (highest confidence with allocation_found=True,
    or the first result if none found allocation).

    Returns None if no .msg files exist for the ticket.
    """
    if not ticket_no or not raw_dir:
        return None

    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from msg_parser import find_msgs_for_ticket

    msg_files = find_msgs_for_ticket(ticket_no, raw_dir)
    if not msg_files:
        return None

    results = []
    for mf in msg_files:
        try:
            r = extract_allocation_from_msg(mf)
            results.append(r)
        except Exception as exc:
            print(f"[email_allocation_extractor] Error processing {mf}: {exc}")

    if not results:
        return None

    # Prefer results with allocation_found=True, then by confidence
    conf_order = {"high": 3, "medium": 2, "low": 1}
    with_alloc = [r for r in results if r.allocation_found]
    if with_alloc:
        best = max(with_alloc, key=lambda r: conf_order.get(r.confidence, 0))
        return best

    # All returned allocation_found=False — return first one to signal checked
    return results[0]


# ── CLI usage for testing ───────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 email_allocation_extractor.py <path_to_msg_or_ticket_no> [raw_dir]")
        sys.exit(1)

    arg = sys.argv[1]
    p = Path(arg)
    if p.exists() and p.suffix.lower() == ".msg":
        r = extract_allocation_from_msg(p)
    elif len(sys.argv) >= 3:
        r = extract_allocation_for_ticket(arg, Path(sys.argv[2]))
    else:
        print("Provide a .msg path or ticket_no + raw_dir")
        sys.exit(1)

    if r is None:
        print("No .msg files found for ticket")
    else:
        print(json.dumps(r.__dict__, indent=2, default=str))
