#!/usr/bin/env python3
"""
location_resolver.py — v15.5 Location Resolution Module (L0/L1/L2/L3 cascade + S5 venue-text LLM)

Final cascade (first hit wins):
  L0: Employee's own Manpower location — handled UPSTREAM in cost_center_resolver/process_batch
  L1: Email LLM — reads full .msg + attachments, asks Gemini where to charge (only when L0 missed)
  L2: IATA deterministic map — unambiguous KSA cities + known international
  L3: LLM city classification — for IATA codes not in L2 map
  No L4 default — LOCATION_UNMAPPABLE flag if all layers miss

NEVER writes 20100.

Flags emitted:
  LOCATION_FROM_EMPLOYEE_MANPOWER  (L0 - set upstream)
  LOCATION_FROM_EMAIL_LLM          (L1)
  LOCATION_INTERNATIONAL           (intl trip - review flag)
  LOCATION_FROM_IATA_MAP           (L2)
  LOCATION_FROM_LLM_CITY_CLASS     (L3)
  LOCATION_FROM_VENUE_LLM          (S5 - venue text resolved to KSA region)
  LOCATION_VENUE_INTERNATIONAL     (S5 - venue text identified international city, high confidence)
  LOCATION_UNMAPPABLE              (all layers missed)
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
LOCATION_LLM_CACHE_DIR = ROOT / "extracted" / "location-llm-cache"
LOCATION_LLM_CACHE_DIR.mkdir(parents=True, exist_ok=True)
LOCATION_LLM_VENUE_CACHE_DIR = LOCATION_LLM_CACHE_DIR / "venue"
LOCATION_LLM_VENUE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# L2: Hardcoded IATA -> Region (unambiguous only)
# ---------------------------------------------------------------------------
# Central = 10100, Western = 40100, Eastern = 30100
IATA_TO_REGION: dict[str, str] = {
    # Central (Riyadh / Nejd plateau)
    "RUH": "10100",
    "ELQ": "10100",
    # Western (Jeddah / Hejaz / Red Sea coast / Asir)
    "JED": "40100",
    "MED": "40100",
    "YNB": "40100",
    "TIF": "40100",
    "GIZ": "40100",
    "TUU": "40100",
    "AJF": "40100",
    "ABT": "40100",
    "TUI": "40100",
    "AHB": "40100",
    "WAE": "40100",
    # Eastern (Dammam / Gulf coast)
    "DMM": "30100",
    "AQI": "30100",
    "HOF": "30100",
}

# Known international airports (flag LOCATION_INTERNATIONAL)
INTERNATIONAL_IATA: set[str] = {
    "DOH", "DXB", "AUH", "CDG", "BCN", "VIE", "CMN", "AMM", "MUC",
    "CAI", "ATH", "ORD", "BRU", "IST", "ZYR", "MBA", "LHR", "JFK",
    "IAD", "YYZ", "FRA", "ZRH", "GVA", "MAD", "FCO", "MXP",
    "NBO", "ADD", "JNB", "KWI", "BAH", "MCT", "BOM", "DEL", "SIN",
    "KUL", "BKK", "HKG", "ICN", "NRT", "PEK", "PVG", "SYD",
}

HOME_IATA = "RUH"


# ---------------------------------------------------------------------------
# IATA extraction from Description
# ---------------------------------------------------------------------------

def parse_destination_from_description(desc: str) -> tuple[Optional[str], list[str]]:
    """
    Extract (primary_destination_IATA, full_itinerary) from description.
    Uses word boundaries so partial words (HOTEL->HOT, AIRPORT->AIR) are ignored.
    """
    if not desc:
        return None, []
    desc = str(desc)
    m = re.search(r' - ((?:[A-Z]{2,3}\b)(?:\s+[A-Z]{2,3}\b)*)', desc)
    if not m:
        return None, []
    itinerary = m.group(1).split()
    if not itinerary:
        return None, []
    if len(itinerary) == 1:
        return itinerary[0], itinerary
    if itinerary[0] == itinerary[-1]:
        middle = itinerary[1:-1]
        if not middle:
            return itinerary[0], itinerary
        for city in middle:
            if city != HOME_IATA:
                return city, itinerary
        return middle[0], itinerary
    return itinerary[-1], itinerary


# ---------------------------------------------------------------------------
# Shared LLM helpers
# ---------------------------------------------------------------------------

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


_GEMINI_MODEL_CASCADE = ["gemini-pro-latest", "gemini-2.5-pro"]


def _call_gemini_model(prompt_text: str, api_key: str, model: str) -> Optional[dict]:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/"
        f"models/{model}:generateContent?key={api_key}"
    )
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt_text}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 4096},
    }).encode()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    _parts = data["candidates"][0]["content"]["parts"]
    text = " ".join(p.get("text", "") for p in _parts if "text" in p).strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text).strip()
    if not text.startswith("{"):
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            text = match.group()
    return json.loads(text)


def _call_litellm(prompt_text: str, api_key: str, base_url: str) -> Optional[dict]:
    url = base_url.rstrip("/") + "/chat/completions"
    payload = json.dumps({
        "model": "anthropic/claude-sonnet-4-6",
        "messages": [{"role": "user", "content": prompt_text}],
        "temperature": 0.1,
        "max_tokens": 512,
    }).encode()
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    text = data["choices"][0]["message"]["content"].strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text).strip()
    if not text.startswith("{"):
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            text = match.group()
    return json.loads(text)


def _call_llm(prompt_text: str) -> tuple[Optional[dict], str]:
    """Try Gemini first, fall back to LiteLLM (Claude Sonnet)."""
    gemini_key = _load_env_key("GEMINI_API_KEY")
    if gemini_key:
        for model in _GEMINI_MODEL_CASCADE:
            try:
                result = _call_gemini_model(prompt_text, gemini_key, model)
                if result:
                    return result, f"gemini/{model}"
            except Exception as e:
                print(f"[location_resolver] Gemini {model} failed: {e}", file=sys.stderr)

    litellm_key = _load_env_key("LITELLM_API_KEY") or _load_env_key("ANTHROPIC_API_KEY")
    litellm_url = _load_env_key("ANTHROPIC_BASE_URL") or "http://143.198.136.126:4000"
    if litellm_key:
        try:
            result = _call_litellm(prompt_text, litellm_key, litellm_url)
            if result:
                return result, "litellm"
        except Exception as e:
            print(f"[location_resolver] LiteLLM failed: {e}", file=sys.stderr)

    return None, ""


# ---------------------------------------------------------------------------
# L1: Email LLM - read full .msg + attachments, ask where to charge
# ---------------------------------------------------------------------------

_L1_PROMPT_TMPL = """You are an expense classification expert for AlJeel Medical (Saudi Arabia).
AlJeel has three regional cost centers:
  - Central: Riyadh and central/northern Saudi Arabia (location code 10100)
  - Western: Jeddah, Medina, Yanbu, Taif, Tabuk, Abha, Jizan, Al-Jouf, Najran (Red Sea/Hejaz/Asir axis, code 40100)
  - Eastern: Dammam, Hofuf, Hafr Al-Batin (Gulf coast/Eastern Province, code 30100)
  - International: Travel outside Saudi Arabia entirely

Analyze this travel expense email and determine WHERE the work/travel expense should be charged.

PRIORITY signals (check in this order):
1. Oracle Fusion travel request form field "To City:" or "Destination:"
2. Flight itinerary city names in the email body
3. Hotel booking city
4. Conference/event city mentioned in subject or body
5. OPEX reference description in attached PDFs

Email subject: {subject}

Email body + attachments:
{body}

Return ONLY valid JSON (no markdown):
{{"location_intent": "central", "source_field": "<verbatim text fragment, max 80 chars>", "confidence": "high", "notes": "brief reasoning"}}

Valid values: location_intent = central|western|eastern|international|unclear; confidence = high|medium|low
Return location_intent=unclear with confidence=low if you genuinely cannot determine the region."""

LOCATION_LLM_CACHE_L1_DIR = LOCATION_LLM_CACHE_DIR / "email"
LOCATION_LLM_CACHE_L1_DIR.mkdir(parents=True, exist_ok=True)


def _get_pdf_text_for_dir(msg_dir: Path) -> str:
    """Get extracted PDF text from opex-pdf-cache for PDFs in msg_dir."""
    opex_cache = ROOT / "extracted" / "opex-pdf-cache"
    texts = []
    if not msg_dir.is_dir():
        return ""
    for pdf in msg_dir.glob("*.pdf"):
        try:
            h = hashlib.sha256(pdf.read_bytes()).hexdigest()
            opex_hit = opex_cache / f"{h}.json"
            if opex_hit.exists():
                d = json.loads(opex_hit.read_text())
                txt = d.get("text", "") or d.get("body_text", "")
                if txt:
                    texts.append(f"[PDF: {pdf.name}]\n{txt}")
                    continue
        except Exception:
            pass
        try:
            import fitz
            doc = fitz.open(str(pdf))
            txt = "\n".join(page.get_text() for page in doc)
            if txt.strip():
                texts.append(f"[PDF: {pdf.name}]\n{txt}")
        except Exception:
            pass
    return "\n\n".join(texts)


def resolve_location_from_email(
    msg_paths: list,
    ticket_no: str = "",
) -> tuple[Optional[str], str, str]:
    """
    L1: Read full .msg + attachments for ticket, ask LLM where to charge.

    Returns: (location_code, "L1", audit_flag)
      location_code is None if confidence is low/unclear (fall through to L2/L3).
    """
    if not msg_paths:
        return None, "L1", ""

    msg_path = Path(msg_paths[0])
    if not msg_path.exists():
        return None, "L1", ""

    sha = hashlib.sha256(msg_path.read_bytes()).hexdigest()
    cache_file = LOCATION_LLM_CACHE_L1_DIR / f"{sha}.json"

    def _apply_cached(cached: dict):
        loc_intent = cached.get("location_intent", "unclear").lower()
        confidence = cached.get("confidence", "low").lower()
        if confidence in ("high", "medium") and loc_intent in ("central", "western", "eastern"):
            code = {"central": "10100", "western": "40100", "eastern": "30100"}[loc_intent]
            return code, "L1", "LOCATION_FROM_EMAIL_LLM"
        elif loc_intent == "international":
            return "INTL", "L1", "LOCATION_INTERNATIONAL"
        return None, "L1", ""

    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text())
            return _apply_cached(cached)
        except Exception:
            pass

    # Parse .msg - full read, no cap (v15.1 pattern)
    try:
        sys.path.insert(0, str(ROOT / "scripts"))
        from msg_parser import parse_msg
        parsed = parse_msg(msg_path)
        subject = parsed.get("subject", "") or ""
        body = parsed.get("body_text", "") or ""
    except Exception as e:
        print(f"[location_resolver] L1 msg parse failed for {msg_path.name}: {e}", file=sys.stderr)
        return None, "L1", ""

    # Append PDF text - uncapped
    pdf_text = _get_pdf_text_for_dir(msg_path.parent)
    full_body = body
    if pdf_text:
        full_body += f"\n\n{pdf_text}"

    if not full_body.strip() and not subject.strip():
        return None, "L1", ""

    prompt = _L1_PROMPT_TMPL.format(subject=subject, body=full_body)
    llm_result, provider = _call_llm(prompt)

    cache_data = llm_result or {
        "location_intent": "unclear", "confidence": "low",
        "source_field": "", "notes": "LLM returned None",
    }
    cache_data["_provider"] = provider
    try:
        cache_file.write_text(json.dumps(cache_data, ensure_ascii=False, indent=2))
    except Exception:
        pass

    if llm_result is None:
        return None, "L1", ""

    loc_intent = llm_result.get("location_intent", "unclear").lower()
    confidence = llm_result.get("confidence", "low").lower()
    source = llm_result.get("source_field", "")[:60]
    print(f"[location_resolver] L1 {ticket_no}: intent={loc_intent!r} conf={confidence!r} via {provider} | {source}")

    return _apply_cached(llm_result)


# ---------------------------------------------------------------------------
# L3: LLM city classification for unknown IATA
# ---------------------------------------------------------------------------

_L3_PROMPT_TMPL = """You are a Saudi Arabia geography expert. Classify the following city/airport into one of AlJeel Medical's three regional categories:

- Central: Riyadh region and Nejd plateau (e.g. Riyadh, Buraydah, Hail, Arar vicinity, northern regions)
- Western: Hejaz region, Red Sea coast, Asir highlands (e.g. Jeddah, Medina, Yanbu, Taif, Abha, Jizan, Tabuk, Al-Jouf, Najran, Al-Wajh, Turaif, Al-Baha)
- Eastern: Gulf coast and Eastern Province (e.g. Dammam, Hofuf, Qaisumah, Jubail, Hafr Al-Batin)
- International: Outside Saudi Arabia entirely

Input: {city_input}

Return ONLY valid JSON (no markdown):
{{"region": "central", "city": "resolved city name", "confidence": "high", "reasoning": "1 sentence"}}

Valid region values: central|western|eastern|international"""

LOCATION_LLM_CACHE_L3_DIR = LOCATION_LLM_CACHE_DIR / "city"
LOCATION_LLM_CACHE_L3_DIR.mkdir(parents=True, exist_ok=True)


def _l3_cache_key(city_iata: str, city_name: str) -> str:
    raw = f"{city_iata.upper()}|{city_name.upper().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()


def resolve_via_llm_city(city_iata: str, city_name: str = "") -> dict:
    """L3: Classify unknown IATA via LLM. Cached per (IATA, city_name)."""
    city_input = f"{city_iata} ({city_name})" if city_name else city_iata
    key = _l3_cache_key(city_iata, city_name)
    cache_file = LOCATION_LLM_CACHE_L3_DIR / f"{key}.json"

    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text())
            cached["_from_cache"] = True
            return cached
        except Exception:
            pass

    prompt = _L3_PROMPT_TMPL.format(city_input=city_input)
    result, provider = _call_llm(prompt)

    if result is None:
        result = {"region": "unknown", "city": city_iata, "confidence": "low", "reasoning": "LLM unavailable"}

    result["_provider"] = provider
    result["_from_cache"] = False
    try:
        cache_file.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        pass

    return result



# ---------------------------------------------------------------------------
# S5: Venue-text LLM — for sentinel rows with hotel/venue keywords
# ---------------------------------------------------------------------------

_VENUE_KEYWORDS_RE = re.compile(
    r'(hotel|hyatt|marriott|hilton|sheraton|radisson|accor|novotel|ibis|mercure'
    r'|intercontinental|crowne\s*plaza|holiday\s*inn|four\s*seasons|ritz.carlton'
    r'|westin|renaissance|kempinski|sofitel|wyndham|doubletree|courtyard|fairmont'
    r'|pullman|movenpick|rotana|carlton|palace|grand|regency|meeting\s*room'
    r'|conference|resort|plaza|suite|inn|hostel|lodge)'
    r'|(riyadh|jeddah|dammam|khobar|medina|makkah|mecca|yanbu|taif|abha|jizan'
    r'|jubail|hofuf|tabuk|hail|buraidah|najran|al.jouf|chicago|athens|prague'
    r'|barcelona|london|paris|dubai|doha|istanbul|cairo|amsterdam|berlin|vienna'
    r'|rome|madrid|milan|zurich|geneva|brussels|moscow|toronto|sydney|singapore'
    r'|bangkok|tokyo|seoul|beijing|shanghai|hong\s*kong|new\s*york|los\s*angeles'
    r'|san\s*francisco|washington|miami|houston|boston|nairobi|johannesburg)',
    re.IGNORECASE,
)



def _normalize_description_for_cache(description: str) -> str:
    """
    Strip variable identifiers (ticket numbers, dates, J-refs, OPEX codes)
    so the same venue produces the same cache key even across batches.

    E.g.:
      'MEETING ROOM 27 APR - Holiday Inn Riyadh Meydan - 1 NTS. (26-689) OPEX-...'
      'MEETING ROOM 28 APR - Holiday Inn Riyadh Meydan - 1 NTS. (26-690) OPEX-...'
    Both -> 'MEETING ROOM - HOLIDAY INN RIYADH MEYDAN'
    """
    text = str(description)
    # 1. Strip trailing reference suffixes (everything from first code block onward)
    text = re.sub(r'\s+(?:OPEX|HF|SIS|CRM|EP|OPEX-\w)[-/\w]*.*$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+J-\d{4}-\d+.*$', '', text, flags=re.IGNORECASE)
    # 2. Strip parenthesized ticket numbers like (26-689)
    text = re.sub(r'\s*\(\d{2,3}-\d+\)\s*', ' ', text)
    # 3. Strip month-dates: "27 APR", "5 MAR"
    text = re.sub(
        r'\s+\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b',
        '', text, flags=re.IGNORECASE)
    # 4. Strip NTS (nights) suffix: "- 1 NTS." or "- 3 NT"
    text = re.sub(r'\s*-\s*\d{1,2}\s+NTS?\.?\s*', '', text, flags=re.IGNORECASE)
    # 5. Collapse spaces and strip trailing punctuation
    text = re.sub(r'\s{2,}', ' ', text).strip()
    text = text.rstrip('.-/ ').strip()
    return text.upper()



def _has_venue_keywords(description: str) -> bool:
    """Return True if description contains venue/hotel/city keywords worth sending to LLM."""
    return bool(_VENUE_KEYWORDS_RE.search(str(description)))




_S5_PROMPT_TMPL = """The following description is from an AlJeel Medical AP expense line.
Identify the GEOGRAPHIC LOCATION where this expense was incurred (hotel city, venue city, event city).
Return JSON:
{{
  "location_intent": "central" | "western" | "eastern" | "international" | "unclear",
  "city_identified": "<verbatim city/venue text from the description>",
  "reasoning": "<1 sentence>",
  "confidence": "high" | "medium" | "low"
}}

Central = Riyadh region / Nejd plateau (Riyadh, Buraydah, Hail, and surrounding cities)
Western = Jeddah / Mecca / Medina / Yanbu / Taif / Jizan / Tabuk / Hejaz / Asir / Red Sea coast
Eastern = Dammam / Khobar / Jubail / Hofuf / Eastern Province
International = any city OUTSIDE Saudi Arabia (e.g., Chicago, Athens, Prague, Barcelona, Dubai, London)

Description: {description}

Return ONLY the JSON object. No markdown, no explanation outside the JSON."""


def _resolve_via_venue_text_llm(description: str) -> tuple[str, str, str]:
    """
    S5: Venue-text LLM classifier.
    Called ONLY for rows that are about to get sentinel 99999 AND contain venue/hotel keywords.

    Returns (location_code | SENTINEL_LOCATION, layer_name, flag_name):
      - KSA region code + 'S5_venue_llm' + 'LOCATION_FROM_VENUE_LLM'         (green)
      - SENTINEL_LOCATION + 'S5_venue_intl' + 'LOCATION_VENUE_INTERNATIONAL'  (yellow, high/medium conf)
      - SENTINEL_LOCATION + 'S5_venue_unclear' + 'LOCATION_UNMAPPABLE'        (unclear/low conf)
    """
    if not _has_venue_keywords(description):
        return SENTINEL_LOCATION, 'S_unmappable', 'LOCATION_UNMAPPABLE'

    normalized = _normalize_description_for_cache(description)
    cache_key = hashlib.sha256(normalized.encode()).hexdigest()
    cache_file = LOCATION_LLM_VENUE_CACHE_DIR / f"{cache_key}.json"

    def _interpret(result: dict) -> tuple[str, str, str]:
        intent = result.get('location_intent', 'unclear').lower()
        confidence = result.get('confidence', 'low').lower()
        city = result.get('city_identified', '')[:80]
        if intent in ('central', 'western', 'eastern') and confidence in ('high', 'medium'):
            code = {'central': '10100', 'western': '40100', 'eastern': '30100'}[intent]
            print(f'[location_resolver] S5 venue→{intent} ({city}) conf={confidence}')
            return code, 'S5_venue_llm', 'LOCATION_FROM_VENUE_LLM'
        elif intent == 'international' and confidence in ('high', 'medium'):
            print(f'[location_resolver] S5 venue→international ({city}) conf={confidence}')
            return SENTINEL_LOCATION, 'S5_venue_intl', 'LOCATION_VENUE_INTERNATIONAL'
        else:
            print(f'[location_resolver] S5 venue→unclear/low-conf ({intent}/{confidence}/{city})')
            return SENTINEL_LOCATION, 'S5_venue_unclear', 'LOCATION_UNMAPPABLE'

    if cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text())
            return _interpret(cached)
        except Exception:
            pass

    prompt = _S5_PROMPT_TMPL.format(description=description)
    result, provider = _call_llm(prompt)

    if result is None:
        return SENTINEL_LOCATION, 'S5_venue_unclear', 'LOCATION_UNMAPPABLE'

    result['_provider'] = provider
    result['_normalized_key'] = normalized
    try:
        cache_file.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception:
        pass

    return _interpret(result)

# Keep alias for backwards compatibility
resolve_via_llm = resolve_via_llm_city

REGION_TO_CODE = {"central": "10100", "western": "40100", "eastern": "30100"}


# ---------------------------------------------------------------------------
# Main L2/L3 entry point (called after L0 and L1 both missed)
# ---------------------------------------------------------------------------

def resolve_location(
    emp_no: Optional[int] = None,
    description: str = "",
    form_body: str = "",
    manpower_df=None,
) -> tuple[str, str, str]:
    """
    Resolve location code via L2 then L3 cascade.

    Called ONLY when L0 (Manpower employee) and L1 (email LLM) did not fire.

    Returns: (location_code, layer, audit_flag)
    """
    dest_iata, _ = parse_destination_from_description(description)

    if dest_iata:
        if dest_iata in INTERNATIONAL_IATA:
            return "INTL", "L2", "LOCATION_INTERNATIONAL"
        if dest_iata in IATA_TO_REGION:
            return IATA_TO_REGION[dest_iata], "L2", "LOCATION_FROM_IATA_MAP"
        # L3
        llm_result = resolve_via_llm_city(dest_iata)
        region = llm_result.get("region", "unknown").lower()
        if region in REGION_TO_CODE:
            return REGION_TO_CODE[region], "L3", "LOCATION_FROM_LLM_CITY_CLASS"
        elif region == "international":
            return "INTL", "L3", "LOCATION_INTERNATIONAL"
        print(f"[location_resolver] L3 unknown region '{region}' for {dest_iata}", file=sys.stderr)

    # S5: Venue-text LLM — final attempt for rows with hotel/venue keywords
    if _has_venue_keywords(description):
        s5_code, s5_layer, s5_flag = _resolve_via_venue_text_llm(description)
        if s5_code != SENTINEL_LOCATION:
            return s5_code, s5_layer, s5_flag
        if s5_flag == 'LOCATION_VENUE_INTERNATIONAL':
            return s5_code, s5_layer, s5_flag

    return SENTINEL_LOCATION, "S_unmappable", "LOCATION_UNMAPPABLE"


def resolve_sponsor_location(description: str, form_body: str = "") -> tuple[str, str, str]:
    """Resolve location for sponsor rows (no Manpower employee). Uses L2/L3 only."""
    dest_iata, _ = parse_destination_from_description(description)
    if dest_iata:
        if dest_iata in INTERNATIONAL_IATA:
            return "INTL", "L2", "LOCATION_INTERNATIONAL"
        if dest_iata in IATA_TO_REGION:
            return IATA_TO_REGION[dest_iata], "L2", "LOCATION_FROM_IATA_MAP"
        llm_result = resolve_via_llm_city(dest_iata)
        region = llm_result.get("region", "unknown").lower()
        if region in REGION_TO_CODE:
            return REGION_TO_CODE[region], "L3", "LOCATION_FROM_LLM_CITY_CLASS"
        elif region == "international":
            return "INTL", "L3", "LOCATION_INTERNATIONAL"
    # S5: Venue-text LLM — final attempt for rows with hotel/venue keywords
    if _has_venue_keywords(description):
        s5_code, s5_layer, s5_flag = _resolve_via_venue_text_llm(description)
        if s5_code != SENTINEL_LOCATION:
            return s5_code, s5_layer, s5_flag
        if s5_flag == 'LOCATION_VENUE_INTERNATIONAL':
            return s5_code, s5_layer, s5_flag

    return SENTINEL_LOCATION, "S_unmappable", "LOCATION_UNMAPPABLE"


# ---------------------------------------------------------------------------
# v15.4 Sponsorship Location Resolver — Origin-based cascade
# ---------------------------------------------------------------------------
# Canonical J-number pattern (e.g., J-2026-88, J-2025-191)
_J_NUMBER_RE = re.compile(r'(J-\d{4}-\d+)', re.IGNORECASE)

SENTINEL_LOCATION = "99999"  # 5-digit, not a real AlJeel code; marks for human review


def extract_event_ref(description: str) -> Optional[str]:
    """
    Extract the canonical J-YYYY-NN event reference from a description.
    Examples:
      "SIS-07-2026/J-2026-88/Interventional..."  → "J-2026-88"
      "OPEX-CRM-2026-27/J-2026-83"              → "J-2026-83"
      "HF-2026-8/J-2026-51/OPEX HF#8..."        → "J-2026-51"
      "OPEX-18-DMS-2026-J-2026-72"              → "J-2026-72"
    """
    if not description:
        return None
    m = _J_NUMBER_RE.search(description)
    if m:
        return m.group(1).upper()
    return None


def parse_origin_from_description(desc: str) -> Optional[str]:
    """
    Extract the FIRST IATA code from an itinerary (e.g., 'JED ATH JED' → 'JED').
    Returns None if no itinerary pattern found.
    """
    _, itinerary = parse_destination_from_description(desc)
    if itinerary:
        return itinerary[0]
    return None


def build_sponsor_event_ref_index(all_descriptions: list[str]) -> dict[str, tuple[str, str, str]]:
    """
    Pre-scan all row descriptions to build an index:
      J-number → (origin_iata, location_code, layer)

    Only includes rows that have BOTH an itinerary AND a J-number.
    Used by resolve_sponsor_location_v15_4 for S3 event-ref lookup.
    """
    index: dict[str, tuple[str, str, str]] = {}
    for desc in all_descriptions:
        j_ref = extract_event_ref(desc)
        if not j_ref:
            continue
        origin = parse_origin_from_description(desc)
        if not origin:
            continue
        # Only index if origin is in KSA IATA map (international origins stay as sentinel)
        if origin in IATA_TO_REGION:
            loc = IATA_TO_REGION[origin]
            if j_ref not in index:  # first-seen wins
                index[j_ref] = (origin, loc, "S3_event_ref")
        elif origin in INTERNATIONAL_IATA:
            # international origin - mark as INTL_ORIGIN so hotel rows inherit it
            if j_ref not in index:
                index[j_ref] = (origin, "INTL_ORIGIN", "S3_event_ref_intl")
    return index


def resolve_sponsor_location_v15_4(
    description: str,
    event_ref: Optional[str],
    event_ref_index: dict[str, tuple[str, str, str]],
    form_body: str = "",
) -> tuple[str, str, str]:
    """
    Sponsorship-specific location resolver (v15.4).
    Origin-based cascade: for sponsorship trips, location = ORIGIN (not destination).

    Returns (location_code | SENTINEL_LOCATION, layer_name, flag_name)
    where:
      location_code  = one of "10100", "30100", "40100"
      SENTINEL_LOCATION = "99999" — marks row for human review
    """
    # -----------------------------------------------------------------------
    # S1: Parse ORIGIN IATA from itinerary
    # -----------------------------------------------------------------------
    origin_iata = parse_origin_from_description(description)
    if origin_iata:
        if origin_iata in IATA_TO_REGION:
            return IATA_TO_REGION[origin_iata], "S1_origin_iata", "LOCATION_SPONSOR_FROM_ORIGIN_IATA"
        # Origin is international — fall through to S3

    # -----------------------------------------------------------------------
    # S3: Hotel/Airport-transfer rows with no itinerary
    #     (or international-origin rows) — look up via event-ref index
    # -----------------------------------------------------------------------
    j_ref = event_ref or extract_event_ref(description)
    if j_ref and j_ref in event_ref_index:
        ref_origin, ref_loc, ref_layer = event_ref_index[j_ref]
        if ref_loc not in ("INTL_ORIGIN", SENTINEL_LOCATION):
            return ref_loc, "S3_event_ref", "LOCATION_SPONSOR_FROM_EVENT_REF"
        # sibling airline row had international origin → sentinel
        return SENTINEL_LOCATION, "S3_event_ref_intl", "LOCATION_SPONSOR_ORIGIN_INTERNATIONAL"

    # -----------------------------------------------------------------------
    # S2: Known international origin → sentinel immediately
    # (do NOT use destination-based fallback for rows with explicitly intl origin)
    # -----------------------------------------------------------------------
    if origin_iata and origin_iata in INTERNATIONAL_IATA:
        return SENTINEL_LOCATION, "S2_intl_origin", "LOCATION_SPONSOR_ORIGIN_INTERNATIONAL"

    # -----------------------------------------------------------------------
    # S4: No itinerary parseable at all (origin_iata is None).
    #     Try LLM city classification on destination IATA from description
    #     (e.g., registration rows, hotel-only rows not matched by S3)
    # -----------------------------------------------------------------------
    if origin_iata is None:
        dest_iata, _ = parse_destination_from_description(description)
        if dest_iata and dest_iata not in INTERNATIONAL_IATA:
            if dest_iata in IATA_TO_REGION:
                return IATA_TO_REGION[dest_iata], "S4_dest_iata_fallback", "LOCATION_SPONSOR_FROM_ORIGIN_IATA"
            llm_result = resolve_via_llm_city(dest_iata)
            region = llm_result.get("region", "unknown").lower()
            if region in REGION_TO_CODE:
                return REGION_TO_CODE[region], "S4_llm_city", "LOCATION_FROM_LLM_CITY_CLASS"

    # -----------------------------------------------------------------------
    # S5: Venue-text LLM — final attempt for rows with hotel/venue keywords
    # Activates only when S1/S3/S2/S4 all failed
    # -----------------------------------------------------------------------
    s5_code, s5_layer, s5_flag = _resolve_via_venue_text_llm(description)
    return s5_code, s5_layer, s5_flag

# ===========================================================================
# v15.6: AlJeel-aligned deterministic location resolver
# (Replaces the entire L0-L5 + S1-S5 cascade)
#
# AlJeel GL Location Scheme (confirmed Amr/Laith 2026-05-22):
#   10100 = Head Office
#   20100 = Central Region  (Riyadh-rooted trips -- the DEFAULT)
#   30100 = Eastern Region  (Dammam / Gulf coast)
#   40100 = Western Region  (Jeddah / Hejaz / Asir)
#
# Known mismatches vs. AlJeel canonical J26-640:
#   Sl#74  HAS RUH   -> our rule: 20100  canonical: 30100
#   Sl#62,97  TRAIN TICKET -> our rule: 20100  canonical: 40100
# ===========================================================================

WESTERN_CITIES_V156 = frozenset({
    'JED', 'MED', 'YNB', 'TIF', 'AHB', 'GIZ', 'TUU', 'ABT',
    'EAM', 'RSI', 'AJF', 'TUI', 'WAE',
})
EASTERN_CITIES_V156 = frozenset({'DMM', 'AQI', 'HOF'})
_RUH_V156 = 'RUH'


def resolve_location_v15_6(description: str) -> tuple:
    _, itinerary = parse_destination_from_description(str(description) if description else '')
    if not itinerary:
        return '20100', 'v156_no_iata', 'LOCATION_DEFAULT_CENTRAL_20100'
    iata_set = set(itinerary)
    if any(c in INTERNATIONAL_IATA for c in iata_set):
        return '20100', 'v156_intl', 'LOCATION_DEFAULT_CENTRAL_20100'
    has_western = any(c in WESTERN_CITIES_V156 for c in iata_set)
    has_eastern = any(c in EASTERN_CITIES_V156 for c in iata_set)
    if has_western:
        if (len(itinerary) >= 3 and itinerary[0] == itinerary[-1]
                and all(c == _RUH_V156 for c in itinerary[1:-1])):
            return '20100', 'v156_triangular_hq', 'LOCATION_DEFAULT_CENTRAL_20100'
        return '40100', 'v156_western', 'LOCATION_FROM_WESTERN_CARVEOUT'
    if has_eastern:
        return '30100', 'v156_eastern', 'LOCATION_FROM_EASTERN_CARVEOUT'
    return '20100', 'v156_ambiguous', 'LOCATION_DEFAULT_CENTRAL_20100'

# ===========================================================================
# v15.7: AlJeel-aligned deterministic location resolver (CORRECTED)
#
# Fixes from v15.6:
#   1. WESTERN_CITIES: removed AJF, TUI, WAE (not canonical Western cities)
#   2. EASTERN_CITIES: unchanged {DMM, AQI, HOF}
#   3. AMBIGUOUS_KSA: explicit set {HAS, HMB, ELQ} -> 20100 default
#   4. Triangular rule: requires itinerary[0] IN WESTERN (not just any palindrome)
#      - Fixes DMM RUH DMM / HOF RUH HOF etc. being incorrectly triangularised
#   5. Western-beats-Eastern on mixed itineraries: preserved (Rule 4 before Rule 5)
#
# AlJeel GL Location Scheme:
#   20100 = Central / default
#   30100 = Eastern (Dammam / Gulf coast)
#   40100 = Western (Jeddah / Hejaz / Asir)
# ===========================================================================

WESTERN_CITIES_V157 = frozenset({
    'JED', 'MED', 'YNB', 'TIF', 'AHB', 'GIZ', 'TUU', 'ABT', 'EAM', 'RSI',
})
EASTERN_CITIES_V157 = frozenset({'DMM', 'AQI', 'HOF'})
AMBIGUOUS_KSA_V157 = frozenset({'HAS', 'HMB', 'ELQ'})
_RUH_V157 = 'RUH'


def resolve_location_v15_7(description: str) -> tuple:
    """
    v15.7 deterministic location resolver (v15.10: added train ticket override).

    Rules (first match wins):
      R0: TRAIN TICKET keyword -> 40100 Western (Haramain rail corridor)
      R1: Any INTL destination -> 20100
      R2: Triangular West-Central-West (JED RUH JED etc.) -> 20100
          Condition: len>=3, first==last, first IN WESTERN, all middle == RUH
      R3: Any AMBIGUOUS_KSA city (HAS/HMB/ELQ) -> 20100
      R4: Any Western city present -> 40100 (Western beats Eastern on mixed)
      R5: Any Eastern city present -> 30100
      R6: Default -> 20100
    """
    # R0 (v15.10): TRAIN TICKET override — Haramain rail (RUH-JED corridor) always Western
    # Canonical posts ALL train tickets to Location=40100 regardless of employee home.
    desc_upper = str(description).upper() if description else ''
    if re.search(r'TRAIN\s+TICKET', desc_upper):
        return '40100', 'v159_train_ticket_western', 'LOCATION_TRAIN_TICKET_WESTERN'

    _, itinerary = parse_destination_from_description(str(description) if description else '')
    if not itinerary:
        return '20100', 'v157_no_iata', 'LOCATION_DEFAULT_CENTRAL_20100'

    iata_set = set(itinerary)

    # R1: International destination
    if any(c in INTERNATIONAL_IATA for c in iata_set):
        return '20100', 'v157_intl', 'LOCATION_DEFAULT_CENTRAL_20100'

    # R3: Ambiguous KSA city (before Western check)
    if any(c in AMBIGUOUS_KSA_V157 for c in iata_set):
        return '20100', 'v157_ambiguous', 'LOCATION_DEFAULT_CENTRAL_20100'

    has_western = any(c in WESTERN_CITIES_V157 for c in iata_set)
    has_eastern = any(c in EASTERN_CITIES_V157 for c in iata_set)

    # R2: Triangular West-Central-West (first must be Western, not just any palindrome)
    if (has_western
            and len(itinerary) >= 3
            and itinerary[0] == itinerary[-1]
            and itinerary[0] in WESTERN_CITIES_V157
            and all(c == _RUH_V157 for c in itinerary[1:-1])):
        return '20100', 'v157_triangular_hq', 'LOCATION_DEFAULT_CENTRAL_20100'

    # R4: Western present -> 40100 (beats Eastern on mixed)
    if has_western:
        return '40100', 'v157_western', 'LOCATION_FROM_WESTERN_CARVEOUT'

    # R5: Eastern present -> 30100
    if has_eastern:
        return '30100', 'v157_eastern', 'LOCATION_FROM_EASTERN_CARVEOUT'

    # R6: Default
    return '20100', 'v157_ambiguous', 'LOCATION_DEFAULT_CENTRAL_20100'
