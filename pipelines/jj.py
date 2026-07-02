#!/usr/bin/env python3
"""
J&J / DePuy 3-way match pipeline for Aljeel AP demo.

Stage 1 — Gemini 2.5 Flash extracts line items from the vendor PDF.
            For large multi-page invoices, splits the PDF into page chunks
            (avoiding Gemini's behavioral cap on single-call output length).
Stage 2 — Deterministic 3-way match against PO sheet + Pre-alert (GR) data.
Stage 3 — Claude Sonnet synthesizes the catch report from the deterministic results.

Outputs to ~/.openclaw/workspace/aljeel/extracted/ and matched/.
"""
import os, json, time, io
from pathlib import Path
import pandas as pd
from pypdf import PdfReader, PdfWriter
from google import genai
from google.genai import types as gtypes
from anthropic import Anthropic

ROOT      = Path('/home/clawdbot/.openclaw/workspace/aljeel')
# RAW_DIR retained for backwards compatibility — discovery layer auto-discovers actual files
RAW_DIR   = ROOT / 'raw' / 'asn-25DEC' / '25DEC048-25DEC054'
DN_WORKBOOK = None  # set at runtime by main() from discovery
EXTRACT   = ROOT / 'extracted'
MATCHED   = ROOT / 'matched'
EXTRACT.mkdir(parents=True, exist_ok=True)
MATCHED.mkdir(parents=True, exist_ok=True)

GEMINI_KEY    = os.environ['GEMINI_API_KEY']
ANTHROPIC_KEY = os.environ['ANTHROPIC_API_KEY']

gemini = genai.Client(api_key=GEMINI_KEY)
claude = Anthropic(api_key=ANTHROPIC_KEY)

GEMINI_MODEL = 'gemini-2.5-flash'
CLAUDE_MODEL = 'claude-sonnet-4-5'

# v3: invoice list, DN workbook, and Oracle reports are discovered at runtime.
# See scripts/discover.py for the rules. To handle new files, drop them in raw/
# and re-run — no edits to this file required.
# Default if discovery hasn't run: empty (pipeline will discover on demand)
_DISCOVERED = None

def _ensure_discovery():
    global _DISCOVERED
    if _DISCOVERED is None:
        from discover import discover_jj
        _DISCOVERED = discover_jj()
    return _DISCOVERED

CHUNK_PAGES = 5  # default; per-invoice override comes from discovery

# ---- PDF helpers -------------------------------------------------------------

def split_pdf(pdf_path: Path, chunk_pages: int = CHUNK_PAGES):
    """Yield (start_page, end_page, bytes) chunks of `chunk_pages` each."""
    reader = PdfReader(str(pdf_path))
    n = len(reader.pages)
    for start in range(0, n, chunk_pages):
        end = min(start + chunk_pages, n)
        writer = PdfWriter()
        for i in range(start, end):
            writer.add_page(reader.pages[i])
        buf = io.BytesIO()
        writer.write(buf)
        yield (start + 1, end, buf.getvalue())  # 1-indexed for human readability

# ---- Header extraction (first chunk only) -----------------------------------

HEADER_PROMPT = """Extract the HEADER of this commercial Tax Invoice (Johnson & Johnson Saudi Arabia → Al Jeel Medical).

Return ONLY this JSON object:
{
  "invoice_number": "...",
  "invoice_date":   "YYYY-MM-DD",
  "seller":         {"name":"...","vat":"...","cr":"..."},
  "buyer":          {"name":"...","vat":"...","account":"..."},
  "currency":       "SAR",
  "customer_po":    ["..."],
  "sales_order":    "...",
  "delivery_note":  "...",
  "icv_number":     "...",
  "payment_terms":  "Net N Days",
  "subtotal":       0.0,
  "vat_amount":     0.0,
  "vat_treatment":  "...",
  "total":          0.0
}

If a field is absent, omit the key. Strip commas from numbers; emit numeric values.
Output ONLY the JSON object. No fences, no commentary."""

LINES_PROMPT = """Extract EVERY invoice line item from these invoice pages. Do NOT skip any line, do NOT summarize, do NOT use "..." or "(continued)".

Return ONLY this JSON object (no fences, no commentary):
{
  "lines": [
    {
      "line_no":          1,
      "vendor_item_code": "...",
      "description":      "...",
      "quantity":         0,
      "uom":              "BX",
      "unit_price":       0.0,
      "line_total":       0.0,
      "lot":              "...",
      "expiry":           "YYYY-MM-DD"
    }
  ]
}

Rules:
- Emit numbers, not strings, for quantity / unit_price / line_total.
- Strip commas from numbers.
- If a field is absent on a particular line, omit the key on that line.
- Preserve the exact line_no shown on the invoice."""

def _parse_json_safely(txt: str):
    txt = txt.strip()
    if txt.startswith('```'):
        txt = txt.split('\n',1)[1].rsplit('```',1)[0]
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        import re
        fixed = re.sub(r',(\s*[}\]])', r'\1', txt)
        return json.loads(fixed)

def call_gemini_pdf(pdf_bytes: bytes, prompt: str, max_tokens: int = 50000):
    resp = gemini.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            gtypes.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'),
            prompt,
        ],
        config=gtypes.GenerateContentConfig(
            response_mime_type='application/json',
            temperature=0,
            max_output_tokens=max_tokens,
        ),
    )
    return resp.text

def extract_invoice(pdf_path: Path, out_path: Path, expected_lines: int, chunk_pages: int = None) -> dict:
    """Extract a vendor invoice PDF with Gemini.

    v2 changes (per QC 2026-05-15 CI-2):
      - Configurable chunk_pages (smaller chunks reduce per-call line-count limit
        pressure; default is CHUNK_PAGES=5 but can override to 2-3 for long invoices).
      - EXTRACTION_INCOMPLETE gate: after extraction, if sum(line_total)/header.total
        is outside [0.98, 1.02], log a warning that downstream catch logic should
        surface as an exception.
      - Cache invalidation: out_path can be deleted by the caller to force re-extract.
    """
    if out_path.exists():
        print(f'  [cache hit] {out_path.name}')
        return json.loads(out_path.read_text())

    chunk_pages = chunk_pages or CHUNK_PAGES
    reader = PdfReader(str(pdf_path))
    total_pages = len(reader.pages)
    print(f'  [extract] {pdf_path.name} ({total_pages} pages, expected ~{expected_lines} lines, chunk_pages={chunk_pages})')

    first_chunk = next(split_pdf(pdf_path, chunk_pages=1))
    t0 = time.time()
    hdr_txt = call_gemini_pdf(first_chunk[2], HEADER_PROMPT, max_tokens=4000)
    header = _parse_json_safely(hdr_txt)
    print(f'    header: invoice {header.get("invoice_number")} total SAR {header.get("total")} ({time.time()-t0:.1f}s)')

    all_lines = []
    for (s, e, chunk_bytes) in split_pdf(pdf_path, chunk_pages):
        t1 = time.time()
        try:
            txt = call_gemini_pdf(chunk_bytes, LINES_PROMPT, max_tokens=50000)
            data = _parse_json_safely(txt)
            chunk_lines = data.get('lines', [])
        except Exception as ex:
            print(f'    pages {s}-{e}: FAILED ({ex}); retrying with stricter prompt')
            txt = call_gemini_pdf(chunk_bytes, LINES_PROMPT + '\n\nReturn STRICT RFC 8259 JSON.', max_tokens=50000)
            data = _parse_json_safely(txt)
            chunk_lines = data.get('lines', [])
        existing = {l.get('line_no') for l in all_lines}
        for l in chunk_lines:
            if l.get('line_no') not in existing:
                all_lines.append(l)
                existing.add(l.get('line_no'))
        print(f'    pages {s}-{e}: +{len(chunk_lines)} lines, running total {len(all_lines)} ({time.time()-t1:.1f}s)')

    data = {'header': header, 'lines': all_lines}
    nlines = len(all_lines)

    # v2: extraction-completeness gate
    hdr_total = header.get('total')
    line_sum = sum((l.get('line_total') or 0) for l in all_lines)
    completeness = round(line_sum / hdr_total, 4) if hdr_total else None
    print(f'  [extract done] {nlines} lines (expected ~{expected_lines}), line_sum SAR {line_sum:.2f} / header SAR {hdr_total:.2f}, completeness {completeness}')
    # v3 (per QC v2): explicit labels to avoid "466 / 349 / 1.0" reading as a
    # contradiction. Extracted-line count is rows extracted from Gemini (includes
    # lot/expiry sub-rows so it's always >= invoice line count). Completeness is
    # a SAR ratio (line_sum / header_total), not a line-count ratio.
    data['extraction_audit'] = {
        'extracted_rows':       nlines,        # rows from Gemini, includes lots
        'expected_invoice_lines': expected_lines,  # canonical line count from Oracle
        'line_sum_sar':         round(line_sum, 2),
        'header_total_sar':     hdr_total,
        'completeness_sar_ratio': completeness,
        'incomplete':           (completeness is not None and (completeness < 0.98 or completeness > 1.02)),
    }
    if data['extraction_audit']['incomplete']:
        gap = (hdr_total or 0) - line_sum
        print(f'  [INCOMPLETE] SAR {gap:.2f} gap ({(1-completeness)*100:.1f}% of invoice missing from extraction)')
    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return data

# ---- PO + Pre-alert loading --------------------------------------------------

def load_po_lines(po_id: str, dn_workbook: Path = None) -> pd.DataFrame:
    """Load PO lines from the DN workbook for a given PO id.

    v3: dn_workbook can be passed in (from discovery) instead of using the
    module-level constant. Sheet name is auto-detected by substring match on
    the last 4 digits of the PO id.
    """
    wb_path = dn_workbook if dn_workbook else DN_WORKBOOK
    short = po_id.replace('PO', '').lstrip('0')[-4:]
    # v3: auto-detect sheet by substring match if a hard mapping doesn't exist
    sheet_map = {'PO25002318':'PO2318', 'PO25002310':'PO2310',
                 'PO25002298':'229-228', 'PO25002299':'229-228'}
    sheet = sheet_map.get(po_id)
    if not sheet and wb_path is not None:
        try:
            xl = pd.ExcelFile(wb_path)
            for s in xl.sheet_names:
                if short in s or po_id in s:
                    sheet = s
                    break
        except Exception:
            pass
    if not sheet:
        return pd.DataFrame()
    # Read with no header — different sheets have different leading-column layouts.
    raw = pd.read_excel(wb_path, sheet_name=sheet, header=None)
    # Find the column that contains this PO id
    po_col = None
    for c in range(raw.shape[1]):
        if raw[c].astype(str).str.contains(po_id, na=False).any():
            po_col = c
            break
    if po_col is None:
        return pd.DataFrame()
    df = raw[raw[po_col].astype(str) == po_id].copy()
    if df.empty:
        return df
    # Slice from po_col through next 9 cols and rename
    cols = ['po','line','type','description','item','qty','uom','base_price','discount_type','discount']
    df = df.iloc[:, po_col:po_col+len(cols)].copy()
    df.columns = cols
    # The PO2318/PO2310 sheets have col-order (po,line,type,item,description,qty,...) — the 229-228
    # sheet has (po,line,type,description,item,qty,...). Detect and swap.
    # If 'description' column looks like an item code (starts 'J-JNJ'), swap with 'item'.
    sample_desc = df['description'].astype(str).head(3).str.upper()
    if any(s.startswith(('J-JNJ','PO','LINE','ITEM')) for s in sample_desc):
        # description and item are swapped in this sheet
        df = df.rename(columns={'description':'_d','item':'_i'}).rename(columns={'_d':'item','_i':'description'})
    df['qty']        = pd.to_numeric(df['qty'], errors='coerce')
    df['base_price'] = pd.to_numeric(df['base_price'], errors='coerce')
    df['discount']   = pd.to_numeric(df['discount'], errors='coerce')
    return df.reset_index(drop=True)

def load_pre_alert(dn_workbook: Path = None) -> pd.DataFrame:
    wb_path = dn_workbook if dn_workbook else DN_WORKBOOK
    raw = pd.read_excel(wb_path, sheet_name='Pre-alert', header=0)
    raw.columns = [str(c).strip() for c in raw.columns]
    cols, seen = [], {}
    for c in raw.columns:
        if c in seen:
            seen[c] += 1
            cols.append(f'{c}_{seen[c]}')
        else:
            seen[c] = 0
            cols.append(c)
    raw.columns = cols
    return raw

# ---- 3-way match -------------------------------------------------------------

def normalize(s):
    """Strip Arabic, lowercase, collapse whitespace, and canonicalize OCR variance.

    J&J invoice descriptions are bilingual: English first, then an Arabic
    translation that may contain a re-statement of the dimensions in English
    numerals. The PO sheet has the English-only canonical form.

    Strategy:
      1. TRUNCATE at the first Arabic character (everything after is the
         Arabic translation + any English-numeral re-statement of dimensions).
         This is the single most effective change - it removes the
         dimensional-residue problem entirely.
      2. Canonicalize remaining OCR variances on the English head.

    v2 OCR-variance fixes (per QC 2026-05-15):
      - 0 vs O ambiguity in dimensional codes (e.g. `540D` <-> `54OD`)
      - Leading `+` stripped (`+4 10D` -> `4 10D`)
      - Spacing around `X`, `x` between numbers (`5X 40MM` <-> `5 X 40MM`)
      - Diameter symbol stripped (`ø 4.0` -> `4.0`)
      - `W/N` <-> `W/ N` <-> `WA N` (OCR misread of `/` as `A`)
    """
    import re
    s = str(s or '')

    # Step 1: truncate at first Arabic character
    arabic_start = None
    for i, ch in enumerate(s):
        cp = ord(ch)
        if 0x0600 <= cp <= 0x06FF or 0x0750 <= cp <= 0x077F or \
           0x08A0 <= cp <= 0x08FF or 0xFB50 <= cp <= 0xFDFF or \
           0xFE70 <= cp <= 0xFEFF:
            arabic_start = i
            break
    if arabic_start is not None:
        s = s[:arabic_start]

    # Step 2: strip remaining special chars (diameter symbol, etc.)
    cleaned = []
    for ch in s:
        if ch in 'øØ':
            continue
        cleaned.append(ch)
    out = ''.join(cleaned).strip().lower()

    # v3 (QC v2 CI-A): targeted letter-digit space fix only for `SCREW<digit>`
    # OCR pattern. NOT a general rule because the J&J item codes intentionally
    # concatenate letters+digits (e.g. '32IDX540D') and breaking those creates
    # different match keys for the same item.
    out = re.sub(r'\bscrew(\d)', r'screw \1', out)

    # v3 (QC v2 CI-A): collapse 'dril'/'drill' OCR variance — keep both as 'dril'
    out = re.sub(r'\bdrill\b', 'dril', out)

    # Strip leading + before digits (OCR sometimes reads bullets as +)
    out = re.sub(r'(?<![a-z0-9])\+(?=\d)', '', out)

    # Canonicalize 'wa' (likely OCR misread of 'w/') back to 'w/' when followed
    # by digits (e.g. 'WA 50' -> 'w/50')
    out = re.sub(r'\bwa\s+(\d)', r'w/\1', out)
    out = re.sub(r'w/\s+', 'w/', out)

    # Collapse spacing around X/x between digits ('5X 40' or '5 X 40' -> '5x40')
    out = re.sub(r'(\d)\s*[x×]\s*(\d)', r'\1x\2', out)

    # Canonicalize 0/O confusion in dimensional codes: after a digit, treat
    # 'OD' / 'OMM' / '0D' / '0MM' identically by normalizing letter-O to '0'
    # when it's surrounded by digit/end context
    out = re.sub(r'(\d)o(d|mm)\b', r'\g<1>0\2', out)
    out = re.sub(r'(\d)o(\d)', r'\g<1>0\2', out)

    # Strip parenthetical residue (rare now that we truncate before Arabic)
    out = re.sub(r'\(\s*\d+\s*\)', ' ', out)
    out = re.sub(r'[()]+', ' ', out)

    # Collapse all whitespace
    out = re.sub(r'[\s,]+', ' ', out).strip()

    # Trim trailing catalog-code tokens (J&J inserts a catalog/group code
    # between the item description and the Arabic translation, e.g.
    # '5.5 EXP VERSE SCR 4.35X20 111' or '... 111.' or '... .131.').
    # The PO has just '5.5 EXP VERSE SCR 4.35X20'.
    # Strip trailing numeric tokens that include only digits + dots, where
    # there's a leading or trailing dot or it's all-digit. Keep dimensional
    # tokens with letters or special chars (4.35X20).
    tokens = out.split()
    # Strip up to 2 trailing tokens that look like catalog codes
    while len(tokens) > 2:
        last = tokens[-1]
        if re.fullmatch(r'\.?\d{1,4}\.?', last) or re.fullmatch(r'\.\d+\.?', last):
            tokens = tokens[:-1]
        else:
            break
    out = ' '.join(tokens)
    return out

def run_match(invoice_data: dict, invoice_meta: dict) -> dict:
    """Aggregate-then-match 3-way reconciliation.

    Invoice lines are first aggregated by item description (because vendor PDFs
    often split one logical line into multiple lot/expiry rows). The aggregated
    qty + value-weighted average price is what we compare against the PO line
    and the GR (Pre-alert) totals.
    """
    inv_no = invoice_meta['invoice_no']
    print(f'  [match] {inv_no} ...')
    pre_alert = load_pre_alert(invoice_meta.get('dn_workbook'))
    pre_alert_inv = pre_alert[pre_alert['Invoice Number'].astype(str).str.contains(inv_no, na=False)]

    # ---- (1) Aggregate invoice lines.
    # v3 (per QC v2 CI-B): aggregate by vendor_item_code when present,
    # otherwise fall back to normalized description.
    # Reason: Gemini sometimes produces 2 different description strings for the
    # same logical item (Arabic text appears at different positions), leading
    # to double-counted aggregation buckets and false-positive QTY_BREAKs.
    # vendor_item_code is stable across those variants.
    raw_lines = invoice_data.get('lines',[])
    by_desc = {}
    # First pass: figure out which vendor_codes appear in PO too (those are
    # safe to aggregate by). Otherwise stick with description.
    # For now: simpler rule — always aggregate by (vendor_item_code or desc_norm)
    for ln in raw_lines:
        desc       = ln.get('description','')
        desc_norm  = normalize(desc)
        qty        = float(ln.get('quantity') or 0)
        price      = float(ln.get('unit_price') or 0)
        total      = float(ln.get('line_total') or (qty*price))
        v_item     = ln.get('vendor_item_code','')
        agg_key    = f'V:{v_item}' if v_item else f'D:{desc_norm}'
        agg = by_desc.setdefault(agg_key, {
            'description': desc,
            'desc_norm':   desc_norm,
            'qty': 0.0, 'amount': 0.0,
            'vendor_codes': set(),
            'invoice_line_nos': [],
            'lots': [],
        })
        agg['qty']    += qty
        agg['amount'] += total
        if v_item: agg['vendor_codes'].add(v_item)
        if ln.get('line_no') is not None: agg['invoice_line_nos'].append(ln.get('line_no'))
        if ln.get('lot'):
            agg['lots'].append({'lot':ln.get('lot'),'qty':qty,'expiry':ln.get('expiry')})

    # ---- (2) PO index: by description, with aggregated qty per PO line ----
    po_by_desc = {}
    for po in invoice_meta['pos']:
        df = load_po_lines(po)
        for _, r in df.iterrows():
            desc = normalize(r['description'])
            po_by_desc.setdefault(desc, []).append((po, r))

    # ---- (3) GR (Pre-alert) by description, summing qty ----
    gr_by_desc = {}
    for _, r in pre_alert_inv.iterrows():
        desc = normalize(r.get('Description',''))
        qty = pd.to_numeric(r.get('Quantity Shipped',0), errors='coerce')
        if pd.notna(qty):
            gr_by_desc[desc] = gr_by_desc.get(desc, 0) + float(qty)

    # ---- (4) Run match on aggregated invoice items ----
    # v2 (per QC 2026-05-15 CI-5): if exact normalize lookup fails, fall back
    # to fuzzy prefix-match (invoice desc starts with a PO desc, or vice versa).
    # This handles cases where Gemini extraction concatenates duplicate copies
    # of the item name (e.g. 'VIPER PRIME CFXFN XTB 5X40MM S CFXFN XTB 5X40MM').

    def fuzzy_po_lookup(desc_norm, po_by_desc):
        """Find PO entries where the invoice's normalized desc shares a long
        prefix with the PO's normalized desc."""
        if not desc_norm:
            return None
        # Try: PO desc is a prefix of invoice desc (covers duplicated text)
        for po_desc, lst in po_by_desc.items():
            if not po_desc:
                continue
            # Require PO desc to be at least 12 chars and match the start of
            # the invoice desc up to a token boundary
            if len(po_desc) >= 12 and desc_norm.startswith(po_desc + ' '):
                return lst
            # Or invoice desc is a prefix of PO desc (rare - missing trailing token)
            if len(desc_norm) >= 12 and po_desc.startswith(desc_norm + ' '):
                return lst
        return None

    matched_items = []
    exceptions = []
    for agg_key, agg in by_desc.items():
        # Aggregation key is V:<vendor_code> or D:<desc_norm>. For PO/GR
        # lookup we always need the normalized description (PO doesn't have
        # vendor_item_code).
        desc_norm = agg['desc_norm']
        po_match_list = po_by_desc.get(desc_norm)
        match_method = 'exact' if po_match_list else None
        if not po_match_list:
            po_match_list = fuzzy_po_lookup(desc_norm, po_by_desc)
            if po_match_list:
                match_method = 'fuzzy_prefix'
        po_match_summary = None
        if po_match_list:
            # v3 (QC v2 CI-C): When the same description appears on multiple PO
            # lines (J&J's PO sheet has 4 such cases for POST IBF cages), SUM
            # the candidate qtys and pick the single best PRICE so the matcher
            # doesn't false-positive QTY_BREAK against a single PO line when
            # the invoice qty matches the sum.
            if len(po_match_list) > 1:
                summed_qty = sum(float(po_row['qty'] or 0) for _, po_row in po_match_list)
                # Best single line for price reference
                ref_po_id, ref_po_row = po_match_list[0]
                po_match_summary = {
                    'po_id':       ref_po_id,
                    'po_item':     ref_po_row.get('item'),
                    'po_line':     None,  # multiple lines summed
                    'po_qty':      summed_qty,
                    'po_price':    float(ref_po_row['base_price']) if pd.notna(ref_po_row['base_price']) else None,
                    'po_lines_summed': len(po_match_list),
                    'po_lines':    [int(r['line']) for _, r in po_match_list if pd.notna(r['line'])],
                    'match_method': match_method,
                }
            else:
                po_id, po_row = po_match_list[0]
                po_match_summary = {
                    'po_id':    po_id,
                    'po_item':  po_row.get('item'),
                    'po_line':  int(po_row.get('line')) if pd.notna(po_row.get('line')) else None,
                    'po_qty':   float(po_row['qty']) if pd.notna(po_row['qty']) else None,
                    'po_price': float(po_row['base_price']) if pd.notna(po_row['base_price']) else None,
                    'match_method': match_method,
                }

        gr_qty = gr_by_desc.get(desc_norm)
        # v2: fuzzy GR lookup
        if gr_qty is None:
            for gr_desc, q in gr_by_desc.items():
                if not gr_desc:
                    continue
                if len(gr_desc) >= 12 and desc_norm.startswith(gr_desc + ' '):
                    gr_qty = q
                    break
                if len(desc_norm) >= 12 and gr_desc.startswith(desc_norm + ' '):
                    gr_qty = q
                    break
        avg_price = (agg['amount']/agg['qty']) if agg['qty'] else 0

        flags = []
        if not po_match_summary:
            flags.append('NO_PO_MATCH')
        else:
            if po_match_summary['po_qty'] is not None and abs(po_match_summary['po_qty'] - agg['qty']) > 0.001:
                flags.append('QTY_BREAK')
            if po_match_summary['po_price'] and avg_price:
                if abs(po_match_summary['po_price'] - avg_price)/po_match_summary['po_price'] > 0.005:
                    flags.append('PRICE_BREAK')
        if gr_qty is None or gr_qty == 0:
            flags.append('NO_GR')
        elif abs(gr_qty - agg['qty']) > 0.001:
            flags.append('QTY_RECV_MISMATCH')

        record = {
            'description':         agg['description'],
            'vendor_codes':        sorted(agg['vendor_codes']),
            'invoice_lines':       sorted(agg['invoice_line_nos'], key=lambda x: (str(type(x).__name__), str(x))),
            'invoice_qty_total':   agg['qty'],
            'invoice_avg_price':   round(avg_price, 2),
            'invoice_amount':      round(agg['amount'], 2),
            'lots_count':          len(agg['lots']),
            **(po_match_summary or {'po_id':None,'po_item':None,'po_line':None,'po_qty':None,'po_price':None}),
            'gr_qty':              gr_qty,
            'match_status':        'MATCHED' if not flags else 'EXCEPTION',
            'flags':               flags,
        }
        matched_items.append(record)
        if flags:
            exceptions.append(record)

    # also keep the raw line detail for drill-down in the dashboard
    raw_line_detail = []
    for ln in raw_lines:
        raw_line_detail.append({
            'line_no':    ln.get('line_no'),
            'description': ln.get('description'),
            'vendor_code': ln.get('vendor_item_code'),
            'qty':         ln.get('quantity'),
            'unit_price':  ln.get('unit_price'),
            'line_total':  ln.get('line_total'),
            'lot':         ln.get('lot'),
            'expiry':      ln.get('expiry'),
        })

    total_items   = len(matched_items)
    matched_count = sum(1 for r in matched_items if r['match_status']=='MATCHED')
    invoice_total = sum((r['invoice_amount'] or 0) for r in matched_items)
    raw_line_count = len(raw_lines)

    return {
        'invoice_no':       inv_no,
        'items_aggregated': total_items,
        'raw_line_count':   raw_line_count,
        'matched':          matched_count,
        'exceptions':       len(exceptions),
        'match_rate':       matched_count/total_items if total_items else 0,
        'invoice_sum':      invoice_total,
        'items':            matched_items,
        'exception_list':   exceptions,
        'raw_lines':        raw_line_detail,
    }

# ---- Catch report (Claude Sonnet) --------------------------------------------

# v2 (per QC CI-4): all NUMBERS in the catch report are computed in Python and
# locked. Claude writes PROSE ONLY around those locked numbers. No regenerating
# counts or SAR sums in natural language.
CATCH_REPORT_PROMPT = """You are writing root-cause + resolver narratives for an AP agent's catch report at Aljeel Medical.

You will be given:
  - The locked headline numbers (invoice total, match count, exception count, match rate).
  - For each exception category, the locked count and locked value-at-risk SAR.
  - The sampled exception lines.

Your job is ONLY to write the prose fields. Do NOT change any number you are given.
Return JSON in this exact schema:

{
  "narrative_summary": "2-3 sentence summary for the CFO. SAR not dollars. State the invoice total, match rate, and the dominant exception category. Quote the LOCKED numbers verbatim.",
  "exception_categories": [
    {
      "category":         "<echo verbatim from input>",
      "count":            <echo verbatim from input>,
      "estimated_value_at_risk_sar": <echo verbatim from input>,
      "root_cause":       "<your prose>",
      "resolver_action":  "<your prose>",
      "lines":            <echo verbatim from input>
    }
  ]
}

No other fields, no markdown fences. Quote numbers exactly as given."""


def synthesize_catch_report(match_result: dict, invoice_data: dict) -> dict:
    inv_no = match_result['invoice_no']
    print(f'  [catch] {inv_no}')

    # Compute locked numbers in Python
    items = match_result['items']
    total_lines    = match_result['items_aggregated']
    matched_lines  = match_result['matched']
    exception_lines = match_result['exceptions']
    match_rate_pct = round(100 * match_result['match_rate'], 2)
    invoice_total  = match_result['invoice_sum']

    # Group exceptions by primary flag, compute count + VaR per category
    from collections import defaultdict
    cat_counts = defaultdict(lambda: {'count': 0, 'value_at_risk_sar': 0.0, 'lines': []})
    for it in items:
        if it.get('match_status') == 'MATCHED':
            continue
        flags = it.get('flags', []) or []
        if not flags:
            continue
        primary = flags[0]
        cat_counts[primary]['count'] += 1
        cat_counts[primary]['value_at_risk_sar'] += (it.get('invoice_amount') or 0)
        ln = it.get('line_no')
        if ln is not None:
            cat_counts[primary]['lines'].append(ln)
    locked_categories = []
    for cat, v in sorted(cat_counts.items(), key=lambda kv: -kv[1]['value_at_risk_sar']):
        locked_categories.append({
            'category':                       cat,
            'count':                          v['count'],
            'estimated_value_at_risk_sar':    round(v['value_at_risk_sar'], 2),
            'lines':                          v['lines'][:50],
        })

    locked = {
        'invoice_no':       inv_no,
        'invoice_total_sar': round(invoice_total, 2),
        'total_lines':      total_lines,
        'matched_lines':    matched_lines,
        'exception_lines':  exception_lines,
        'match_rate_pct':   match_rate_pct,
    }
    payload = {
        'locked_headline_numbers': locked,
        'locked_categories': locked_categories,
        'invoice_header': invoice_data.get('header', {}),
        'sample_exception_items': match_result['exception_list'][:50],
    }
    msg = claude.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4000,
        temperature=0,
        messages=[{'role': 'user', 'content': CATCH_REPORT_PROMPT + '\n\nINPUT:\n' + json.dumps(payload, ensure_ascii=False)}],
    )
    txt = msg.content[0].text.strip()
    if txt.startswith('```'):
        txt = txt.split('\n', 1)[1].rsplit('```', 1)[0]
    claude_result = json.loads(txt)

    # Force-overwrite numbers with our locked values (defense in depth in case
    # Claude ignored instructions).
    locked_by_cat = {c['category']: c for c in locked_categories}
    final_categories = []
    for cat in claude_result.get('exception_categories', []):
        cname = cat.get('category')
        if cname in locked_by_cat:
            ldata = locked_by_cat[cname]
            cat['count'] = ldata['count']
            cat['estimated_value_at_risk_sar'] = ldata['estimated_value_at_risk_sar']
            cat['lines'] = ldata['lines']
            final_categories.append(cat)
    # Add any locked categories Claude missed
    seen = {c.get('category') for c in final_categories}
    for lc in locked_categories:
        if lc['category'] not in seen:
            final_categories.append({
                **lc,
                'root_cause': '(prose pending - category not narrated by Claude)',
                'resolver_action': '(prose pending)',
            })

    return {
        'headline_numbers':   locked,
        'narrative_summary':  claude_result.get('narrative_summary', ''),
        'exception_categories': final_categories,
        'extraction_audit':   invoice_data.get('extraction_audit', {}),
    }

# ---- Main --------------------------------------------------------------------

def main():
    global DN_WORKBOOK
    # v3: discover invoices, DN workbook, and Oracle reports at runtime
    discovered = _ensure_discovery()
    if not discovered:
        print('No J&J invoices discovered. Drop ZSD1COMINV PDFs under raw/ and retry.')
        return
    # Use the DN workbook from the first invoice; assume all invoices share one DN
    DN_WORKBOOK = discovered[0].dn_workbook
    print(f'[discovery] {len(discovered)} J&J invoices found')
    print(f'[discovery] DN workbook: {DN_WORKBOOK.name if DN_WORKBOOK else "(none)"}')

    all_results = []
    for d in discovered:
        # Build the inv config dict that run_match expects
        inv = {
            'invoice_no':         d.invoice_no,
            'pdf':                d.pdf,
            'expected_total_sar': d.expected_total_sar,
            'expected_lines':     d.expected_lines,
            'pos':                d.pos,
            'chunk_pages':        d.chunk_pages,
        }
        print(f'\n=== {inv["invoice_no"]} ===')
        out_ext = EXTRACT / f'{inv["invoice_no"]}.extracted.json'
        data = extract_invoice(inv['pdf'], out_ext, inv['expected_lines'],
                                chunk_pages=inv.get('chunk_pages'))
        match = run_match(data, inv)
        match_path = MATCHED / f'{inv["invoice_no"]}.match.json'
        match_path.write_text(json.dumps(match, indent=2, default=str, ensure_ascii=False))
        catch = synthesize_catch_report(match, data)
        catch_path = MATCHED / f'{inv["invoice_no"]}.catch.json'
        catch_path.write_text(json.dumps(catch, indent=2, ensure_ascii=False))
        all_results.append({
            'invoice_no':         inv['invoice_no'],
            'extracted':          str(out_ext),
            'match':              str(match_path),
            'catch':              str(catch_path),
            'match_rate':         match['match_rate'],
            'exceptions':         match['exceptions'],
            'invoice_total_sar':  match['invoice_sum'],
        })
    summary = MATCHED / 'jj-summary.json'
    summary.write_text(json.dumps(all_results, indent=2, default=str))
    print(f'\n=== DONE ===\nSummary: {summary}')
    for r in all_results:
        print(f'  {r["invoice_no"]}: {r["exceptions"]} exceptions, match_rate={r["match_rate"]:.1%}, total SAR {r["invoice_total_sar"]:,.2f}')

if __name__ == '__main__':
    main()
