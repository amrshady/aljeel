#!/usr/bin/env python3
"""Build a Solventum chargeback workbook from sales lines backed by POD PDFs."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from io import BytesIO
from pathlib import Path
from typing import Callable, Iterable, Protocol, Sequence

from openpyxl import Workbook, load_workbook
from openpyxl.styles import PatternFill


OUTPUT_COLUMNS = (
    "TRX #", "TRX Date", "Order Type", "Account Name", "Ship Address",
    "Item Description", "Manufacturer", "Agency", "Lot Number", "Quantity", "UOM",
)
TRX_PATTERN = re.compile(r"(?<!\d)(2600\d{6})(?!\d)")
MANUFACTURER_PREFIX = re.compile(r"^(?:3MOC-|3MOR-)")
DEFAULT_CATALOG_MAP = Path(__file__).with_name("data") / "solventum_catalog_map.json"
QTY_MISMATCH_FILL_COLOR = "FFF2CC"
TARGET_AGENCY = "Solventum"


@dataclass(frozen=True)
class PodLine:
    catalog_code: str | None = None
    manufacturer_code: str | None = None
    trade_item_number: str | None = None
    description: str | None = None
    lot: str | None = None
    delivered_quantity: float | int | None = None
    uom: str | None = None
    pack_size: float | int | None = None
    source_page: int | None = None
    confidence: float | None = None


@dataclass(frozen=True)
class PodExtraction:
    authoritative_trx: str
    lines: tuple[PodLine, ...] = ()
    document_references: tuple[str, ...] = ()
    confidence: float | None = None
    warnings: tuple[str, ...] = ()
    retain_all_sales: bool = False
    extraction_path: str | None = None
    model: str | None = None


@dataclass(frozen=True)
class NormalizedPodLine:
    """A POD line plus its immutable source and controlled-rule audit trail."""

    raw: PodLine
    normalized: PodLine
    match_sales_codes: tuple[str, ...] = ()
    match_sales_lots: tuple[str, ...] = ()
    applied_rules: tuple[dict[str, object], ...] = ()


class ControlledCatalogMap:
    """Committed, auditable business mappings applied before reconciliation."""

    def __init__(self, path: str | Path = DEFAULT_CATALOG_MAP):
        self.path = Path(path)
        self.data = json.loads(self.path.read_text(encoding="utf-8"))

    def normalize(self, line: PodLine) -> NormalizedPodLine:
        values = asdict(line)
        rules: list[dict[str, object]] = []
        match_codes: list[str] = []
        match_lots: list[str] = []
        searchable = " ".join(str(v or "") for v in (
            line.catalog_code, line.manufacturer_code, line.description,
        )).upper()

        for rule in self.data.get("description_aliases", []):
            aliases = rule.get("aliases", [])
            if any(str(alias).upper() in searchable for alias in aliases):
                values["catalog_code"] = rule["catalog_code"]
                values["manufacturer_code"] = rule.get("manufacturer_code", rule["catalog_code"])
                rules.append(_rule_audit(rule, "description_alias"))
                break

        normalized_code = _normalise_code(values.get("manufacturer_code") or values.get("catalog_code"))
        for rule in self.data.get("identity_exceptions", []):
            if normalized_code in {_normalise_code(v) for v in rule.get("source_codes", [])}:
                values["catalog_code"] = rule.get("output_catalog_code", values.get("catalog_code"))
                values["manufacturer_code"] = rule.get("output_manufacturer_code", values.get("manufacturer_code"))
                if rule.get("output_uom"):
                    values["uom"] = rule["output_uom"]
                match_codes.extend(str(v) for v in rule.get("match_sales_codes", []))
                if rule.get("sales_lot_anchor"):
                    match_lots.append(str(rule["sales_lot_anchor"]))
                rules.append(_rule_audit(rule, "identity_exception"))
                break

        normalized_code = _normalise_code(values.get("manufacturer_code") or values.get("catalog_code"))
        for rule in self.data.get("catalog_pack_rules", []):
            if normalized_code == _normalise_code(rule.get("catalog_code")):
                values["pack_size"] = rule["factor"]
                if rule.get("output_uom"):
                    values["uom"] = rule["output_uom"]
                rules.append(_rule_audit(rule, "catalog_pack"))
                break
        else:
            for rule in self.data.get("uom_pack_patterns", []):
                match = re.fullmatch(rule["pattern"], str(values.get("uom") or ""), re.IGNORECASE)
                if match:
                    values["pack_size"] = float(match.group(rule.get("factor_group", 1)))
                    rules.append(_rule_audit(rule, "uom_pack_pattern"))
                    break

        return NormalizedPodLine(
            raw=line, normalized=PodLine(**values),
            match_sales_codes=tuple(match_codes), match_sales_lots=tuple(match_lots),
            applied_rules=tuple(rules),
        )

    def fallback_warning(self, warnings: Iterable[str]) -> dict[str, object] | None:
        for rule in self.data.get("fallback_warning_patterns", []):
            if any(re.search(rule["pattern"], warning, re.IGNORECASE) for warning in warnings):
                return _rule_audit(rule, "fallback_warning")
        return None


def _rule_audit(rule: dict[str, object], kind: str) -> dict[str, object]:
    return {"rule_id": rule["id"], "kind": kind, "provenance": rule["provenance"]}


class PodExtractor(Protocol):
    def extract(self, pdf_path: Path, authoritative_trx: str) -> PodExtraction: ...


class GeminiClient(Protocol):
    def generate(self, model: str, prompt: str, pdf_bytes: bytes) -> dict[str, object]: ...


class DirectGeminiClient:
    """Minimal direct Google Generative Language API client (no proxy/LiteLLM)."""

    def __init__(self, api_key: str | None = None, timeout: int = 240):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is required for vision extraction")
        self.timeout = timeout

    def generate(self, model: str, prompt: str, pdf_bytes: bytes) -> dict[str, object]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
        body = {
            "contents": [{"parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": "application/pdf", "data": base64.b64encode(pdf_bytes).decode("ascii")}},
            ]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0, "maxOutputTokens": 16384},
        }
        request = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            payload = json.load(response)
        try:
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ValueError(f"Gemini returned no JSON candidate: {payload}") from exc
        return json.loads(_strip_json_fence(str(text)))


POD_PROMPT_VERSION = "solventum-pod-v2"
DEFAULT_GEMINI_MODELS = ("gemini-2.5-flash", "gemini-2.5-pro")


def _strip_json_fence(value: str) -> str:
    value = value.strip()
    if value.startswith("```"):
        value = re.sub(r"^```(?:json)?\s*|\s*```$", "", value, flags=re.IGNORECASE)
    return value


def _pdftotext(pdf_path: Path) -> str:
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"], capture_output=True,
            text=True, timeout=60, check=True,
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return ""
    return result.stdout


def _nullable_string(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _line_from_raw(raw: dict[str, object]) -> PodLine:
    quantity = raw.get("delivered_quantity")
    if quantity not in (None, ""):
        quantity = float(str(quantity).replace(",", ""))
        if quantity.is_integer():
            quantity = int(quantity)
    pack_size = raw.get("pack_size")
    if pack_size not in (None, ""):
        pack_size = float(pack_size)
        if pack_size.is_integer():
            pack_size = int(pack_size)
    source_page = raw.get("source_page")
    if source_page not in (None, ""):
        page_match = re.search(r"\d+", str(source_page))
        source_page = int(page_match.group()) if page_match else None
    return PodLine(
        catalog_code=_nullable_string(raw.get("catalog_code")),
        manufacturer_code=_nullable_string(raw.get("manufacturer_code")),
        trade_item_number=_nullable_string(raw.get("trade_item_number")),
        description=_nullable_string(raw.get("description")), lot=_nullable_string(raw.get("lot")),
        delivered_quantity=quantity, uom=_nullable_string(raw.get("uom")), pack_size=pack_size,
        source_page=source_page,
        confidence=float(raw["confidence"]) if raw.get("confidence") not in (None, "") else None,
    )


def _parse_confident_text_table(text: str) -> dict[str, object] | None:
    """Parse the stable NUPCO receipt text table; reject noisy/partial text layers."""
    if "Trade Item No." not in text or "Description" not in text or "Qty" not in text or "UOM" not in text:
        return None
    # pdftotext lays each receipt row across 1-3 lines and may print quantity before
    # the visually earlier description. Slice at stable row/GTIN anchors first.
    rows: list[dict[str, object]] = []
    anchors = list(re.finditer(r"(?m)^\s*(\d+)\s+(\d+)\s+(\d{12,14})\b", text))
    for index, anchor in enumerate(anchors):
        end = anchors[index + 1].start() if index + 1 < len(anchors) else len(text)
        body = " ".join(text[anchor.end():end].replace("\f", " ").split())
        quantity = re.search(r"\b(\d[\d,]*(?:\.\d+)?)\s+(EA|EACH|BOX|BAG|KIT)\b", body, re.IGNORECASE)
        if not quantity:
            continue
        # Catalog-like codes are short alphanumerics, not GTINs, amounts, or dates.
        catalog_match = re.search(r"\b([A-Z0-9-]{3,10})\s+3M(?:\s+ESPE)?\b", body, re.IGNORECASE)
        catalog = catalog_match.group(1) if catalog_match else None
        rows.append({
            "trade_item_number": anchor.group(3), "description": body,
            "catalog_code": catalog, "manufacturer_code": catalog,
            "delivered_quantity": quantity.group(1), "uom": quantity.group(2).upper(),
            "lot": None, "source_page": 1, "confidence": .96,
        })
    # A partial parse is more dangerous than a vision call. Every anchored receipt
    # row must yield a quantity/UOM.
    if not rows or len(rows) != len(anchors):
        return None
    refs = re.findall(r"(?:PO No\.|Supplier Ref\.|Invoice Number)[^\d]{0,40}(\d{6,14})", text, re.IGNORECASE)
    return {"lines": rows, "document_references": refs, "confidence": .96, "warnings": []}


class GeminiPodExtractor:
    """Hybrid POD extractor: confident text table first, cached Gemini PDF vision otherwise."""

    def __init__(
        self, candidate_sales: dict[str, list[dict[str, object]]], *,
        client: GeminiClient | None = None, cache_dir: str | Path = "batches/solventum/.extraction_cache",
        models: Sequence[str] = DEFAULT_GEMINI_MODELS, prompt_version: str = POD_PROMPT_VERSION,
        text_extractor: Callable[[Path], str] = _pdftotext,
    ):
        self.candidate_sales = candidate_sales
        self._client = client
        self.cache_dir = Path(cache_dir)
        self.models = tuple(models)
        self.prompt_version = prompt_version
        self.text_extractor = text_extractor

    def _prompt(self, authoritative_trx: str) -> str:
        candidates = self.candidate_sales.get(authoritative_trx, [])
        context = [{k: row.get(k) for k in ("Item Description", "Manufacturer", "Lot Number", "Quantity", "UOM")} for row in candidates]
        return f"""Extract delivered item lines from this entire multi-page POD PDF. Return JSON only.
The authoritative Sales TRX is {authoritative_trx}, derived from the filename. Never infer, replace, or fabricate it from document content.
Capture PO, invoice, supplier, delivery, and similar identifiers only in document_references.
Candidate Sales lines are context for mapping GTINs and short descriptions, not evidence of delivery:
{json.dumps(context, ensure_ascii=False)}
Report only item lines actually shown as delivered/received on the POD. Do not copy missing candidates.
Preserve the POD's line-level grain. Emit ONE lines object per delivered (item, lot) pair. Never merge
different Supplier Batch/lot values into one object and never put an item-level aggregate quantity on
a single lot. The delivered_quantity in each object must be the quantity delivered for that exact lot.
Read lot from the Supplier Batch/batch/lot column on the same physical item row, not from an adjacent
Expiry Date, posting/created date, header, amount, PO, WMS reference, or other field. Copy the entire
identifier verbatim, including leading zeros, letters, and hyphens. Valid values include composite codes
such as 0012139140-70200458266 and 13144569-70200458423 and short codes such as 10881738, NE33000,
NC90132, and 12320102. Treat date-like placeholders such as 01-01-1 as expiry data, NEVER as lot.
If a delivered POD item is shown once with an aggregate quantity and its Supplier Batch cell is blank,
use same-item Candidate Sales lines to recover the per-lot breakdown ONLY when their quantities sum
exactly to that POD delivered quantity. In that exact-reconciliation case, emit one object for every
candidate (Lot Number, Quantity) pair, copying each full Lot Number verbatim and using its own Quantity
as delivered_quantity. Do not emit the aggregate item row as an additional line. If the candidate lots
do not exactly reconcile, do not invent a split. A visible Supplier Batch on the POD takes precedence.
Set lot to null only when it is genuinely absent and no exact candidate per-lot reconciliation applies.
Nullable fields catalog_code, manufacturer_code, lot, uom, pack_size, source_page are allowed and must be null when absent.
Schema: {{"document_references":["..."],"confidence":0.0,"warnings":["..."],"lines":[{{"catalog_code":null,"manufacturer_code":null,"trade_item_number":null,"description":null,"lot":null,"delivered_quantity":0,"uom":null,"pack_size":null,"source_page":null,"confidence":0.0}}]}}"""

    def _cache_path(self, pdf_bytes: bytes, model: str, prompt: str) -> Path:
        digest = hashlib.sha256(pdf_bytes + b"\0" + model.encode() + b"\0" + self.prompt_version.encode() + b"\0" + prompt.encode()).hexdigest()
        return self.cache_dir / f"{digest}.json"

    def _result(self, raw: dict[str, object], trx: str, path: str, model: str | None) -> PodExtraction:
        return PodExtraction(
            authoritative_trx=trx,
            lines=tuple(_line_from_raw(line) for line in raw.get("lines", []) if isinstance(line, dict)),
            document_references=tuple(str(v) for v in raw.get("document_references", [])),
            confidence=float(raw["confidence"]) if raw.get("confidence") is not None else None,
            warnings=tuple(str(v) for v in raw.get("warnings", [])), extraction_path=path, model=model,
        )

    def extract(self, pdf_path: Path, authoritative_trx: str) -> PodExtraction:
        text_raw = _parse_confident_text_table(self.text_extractor(pdf_path))
        if text_raw is not None:
            return self._result(text_raw, authoritative_trx, "text", None)
        pdf_bytes, prompt = pdf_path.read_bytes(), self._prompt(authoritative_trx)
        errors = []
        for model in self.models:
            cache_path = self._cache_path(pdf_bytes, model, prompt)
            if cache_path.exists():
                return self._result(json.loads(cache_path.read_text(encoding="utf-8")), authoritative_trx, "vision", model)
            try:
                if self._client is None:
                    self._client = DirectGeminiClient()
                raw = self._client.generate(model, prompt, pdf_bytes)
                if not isinstance(raw, dict) or not isinstance(raw.get("lines"), list):
                    raise ValueError("response does not contain a lines array")
                self.cache_dir.mkdir(parents=True, exist_ok=True)
                cache_path.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")
                return self._result(raw, authoritative_trx, "vision", model)
            except Exception as exc:
                errors.append(f"{model}: {exc}")
        raise RuntimeError("Gemini model cascade failed: " + "; ".join(errors))


class JsonPodExtractor:
    """Offline extractor backed by reviewed JSON; it never opens or sends the PDF."""

    def __init__(self, path: str | Path):
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        self._records = payload.get("extractions", payload)

    def extract(self, pdf_path: Path, authoritative_trx: str) -> PodExtraction:
        raw = self._records.get(authoritative_trx)
        if raw is None:
            raise ValueError(f"No committed POD extraction for TRX {authoritative_trx}")
        # The caller's filename-derived value is deliberately authoritative.
        return PodExtraction(
            authoritative_trx=authoritative_trx,
            lines=tuple(PodLine(**line) for line in raw.get("lines", ())),
            document_references=tuple(raw.get("document_references", ())),
            confidence=raw.get("confidence"),
            warnings=tuple(raw.get("warnings", ())),
            retain_all_sales=bool(raw.get("retain_all_sales", False)),
        )


@dataclass
class _Match:
    pod_index: int
    sales_index: int
    score: float
    reasons: list[str]


def collect_pod_trx_numbers(pods: Iterable[str | Path]) -> set[str]:
    """Return every 10-digit, 2600-prefixed TRX token found in PDF filenames."""
    trx_numbers: set[str] = set()
    for pod in pods:
        path = Path(pod)
        if path.suffix.lower() != ".pdf":
            continue
        trx_numbers.update(TRX_PATTERN.findall(path.name))
    return trx_numbers


def expand_pod_arguments(pods: Sequence[str | Path]) -> list[Path]:
    """Expand CLI POD arguments, accepting PDF paths and/or directories."""
    expanded: list[Path] = []
    for raw in pods:
        path = Path(raw)
        if path.is_dir():
            expanded.extend(sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"))
        else:
            expanded.append(path)
    return expanded


def _normalise_trx(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _is_target_agency(value: object) -> bool:
    """Return whether a Sales agency belongs in this chargeback."""
    return str(value or "").strip().casefold() == TARGET_AGENCY.casefold()


def _normalise_code(value: object) -> str:
    if value is None:
        return ""
    value = MANUFACTURER_PREFIX.sub("", str(value).strip().upper())
    return re.sub(r"[^A-Z0-9]", "", value)


def _normalise_lot(value: object) -> str:
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def _pack_size(uom: object, explicit: object = None) -> float:
    if explicit not in (None, ""):
        return float(explicit)
    match = re.search(r"-(\d+(?:\.\d+)?)$", str(uom or ""))
    return float(match.group(1)) if match else 1.0


def _quantity_for_output(line: PodLine) -> float | int | None:
    if line.delivered_quantity is None:
        return None
    quantity = float(line.delivered_quantity) * _pack_size(line.uom, line.pack_size)
    return int(quantity) if quantity.is_integer() else quantity


def _deduplicate_lines(lines: Iterable[PodLine]) -> list[PodLine]:
    seen: set[tuple[object, ...]] = set()
    result = []
    for line in lines:
        # Page/confidence are evidence metadata, not delivery-line identity.
        key = tuple(getattr(line, name) for name in (
            "catalog_code", "manufacturer_code", "trade_item_number", "description",
            "lot", "delivered_quantity", "uom", "pack_size",
        ))
        if key not in seen:
            seen.add(key)
            result.append(line)
    return result


def _score(item: PodLine | NormalizedPodLine, sales: dict[str, object]) -> tuple[float, list[str]]:
    line = item.normalized if isinstance(item, NormalizedPodLine) else item
    reasons: list[str] = []
    score = 0.0
    pod_lot, sales_lot = _normalise_lot(line.lot), _normalise_lot(sales.get("Lot Number"))
    if pod_lot and sales_lot and pod_lot == sales_lot:
        score += 10000
        reasons.append("exact_lot")
    pod_codes = {_normalise_code(line.catalog_code), _normalise_code(line.manufacturer_code)} - {""}
    sales_code = _normalise_code(sales.get("Manufacturer"))
    if isinstance(item, NormalizedPodLine) and sales_code in {
        _normalise_code(v) for v in item.match_sales_codes
    } and (not item.match_sales_lots or sales_lot in {
        _normalise_lot(v) for v in item.match_sales_lots
    }):
        score += 12000
        reasons.append("controlled_identity_exception")
    if sales_code and sales_code in pod_codes:
        score += 3000
        reasons.append("exact_code")
    if line.delivered_quantity is not None and sales.get("Quantity") not in (None, ""):
        try:
            if float(_quantity_for_output(line)) == float(sales["Quantity"]):
                score += 20
                reasons.append("quantity_compatible")
        except (TypeError, ValueError):
            pass
    if line.uom and sales.get("UOM") and str(line.uom).split("-")[0].lower() == str(sales["UOM"]).split("-")[0].lower():
        score += 10
        reasons.append("uom_compatible")
    return score, reasons


def _global_assignment(lines: list[PodLine | NormalizedPodLine], sales: list[dict[str, object]]) -> tuple[list[_Match], bool]:
    """Maximum-score one-to-one assignment. Tied optima are reported ambiguous."""
    candidates = [[_score(line, row) for row in sales] for line in lines]
    states: dict[int, tuple[float, tuple[int, ...], int]] = {0: (0.0, (), 1)}
    for line_scores in candidates:
        nxt: dict[int, tuple[float, tuple[int, ...], int]] = {}
        for mask, (total, assignment, ways) in states.items():
            for index, (score, _) in enumerate(line_scores):
                if mask & (1 << index) or score < 100:
                    continue
                new_mask, new_total = mask | (1 << index), total + score
                previous = nxt.get(new_mask)
                candidate_assignment = assignment + (index,)
                if previous is None or new_total > previous[0]:
                    nxt[new_mask] = (new_total, candidate_assignment, ways)
                elif new_total == previous[0]:
                    nxt[new_mask] = (previous[0], min(previous[1], candidate_assignment), previous[2] + ways)
        states = nxt
        if not states:
            return [], True
    best_score = max(value[0] for value in states.values())
    best = [value for value in states.values() if value[0] == best_score]
    assignment = min(value[1] for value in best)
    ambiguous = len(best) > 1 or sum(value[2] for value in best) > 1
    matches = [_Match(i, j, candidates[i][j][0], candidates[i][j][1]) for i, j in enumerate(assignment)]
    return matches, ambiguous


def _partial_assignment(lines: list[NormalizedPodLine], sales: list[dict[str, object]]) -> list[_Match]:
    """Select only reciprocal unique-best pairs; leave every uncertain row untouched."""
    remaining_lines, remaining_sales = set(range(len(lines))), set(range(len(sales)))
    matches: list[_Match] = []
    while True:
        accepted: list[tuple[int, int, float, list[str]]] = []
        for line_index in sorted(remaining_lines):
            scored = [(_score(lines[line_index], sales[j]), j) for j in sorted(remaining_sales)]
            if not scored:
                continue
            best_score = max(value[0][0] for value in scored)
            best_sales = [(value, j) for value, j in scored if value[0] == best_score]
            if best_score < 100 or len(best_sales) != 1:
                continue
            (score, reasons), sales_index = best_sales[0]
            competing = [_score(lines[i], sales[sales_index])[0] for i in remaining_lines]
            if competing.count(max(competing)) == 1 and score == max(competing):
                accepted.append((line_index, sales_index, score, reasons))
        if not accepted:
            break
        for line_index, sales_index, score, reasons in accepted:
            if line_index in remaining_lines and sales_index in remaining_sales:
                matches.append(_Match(line_index, sales_index, score, reasons))
                remaining_lines.remove(line_index)
                remaining_sales.remove(sales_index)
    return matches


def _open_sales_workbook(path: Path):
    return load_workbook(BytesIO(path.read_bytes()), read_only=True, data_only=True)


def _read_sales(path: Path) -> tuple[list[dict[str, object]], object]:
    workbook = _open_sales_workbook(path)
    if "Sheet2" not in workbook.sheetnames:
        workbook.close()
        raise ValueError("Sales workbook must contain a sheet named 'Sheet2'")
    sheet = workbook["Sheet2"]
    header_values = next(sheet.iter_rows(min_row=1, max_row=1, values_only=True), None)
    if not header_values:
        workbook.close()
        raise ValueError("Sales workbook Sheet2 is empty")
    header_map = {str(value).strip(): index for index, value in enumerate(header_values) if value is not None}
    missing = [column for column in OUTPUT_COLUMNS if column not in header_map]
    if missing:
        workbook.close()
        raise ValueError(f"Sales workbook Sheet2 is missing required columns: {', '.join(missing)}")
    rows = [{name: row[index] for name, index in header_map.items()} for row in sheet.iter_rows(min_row=2, values_only=True)]
    return rows, workbook


def _output_values(row: dict[str, object]) -> list[object]:
    values = [row.get(column) for column in OUTPUT_COLUMNS]
    if isinstance(values[6], str):
        values[6] = MANUFACTURER_PREFIX.sub("", values[6])
    return values


EXCEPTION_COLUMNS = (
    "status", "TRX", "fallback_reason", "affected Sales rows",
    "extracted POD lines", "unmatched candidates",
)


def _json_cell(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def _sales_audit_row(row: dict[str, object]) -> dict[str, object]:
    return {column: row.get(column) for column in OUTPUT_COLUMNS}


def _is_excluded_nonchargeback_line(item: NormalizedPodLine) -> bool:
    """Identify document context that must not participate in chargeback matching."""
    line = item.normalized
    text = " ".join(str(value or "") for value in (
        line.catalog_code, line.manufacturer_code, line.description,
    )).upper()
    return bool(re.search(r"\b(?:DELIVERY|FREIGHT|SHIPPING|TRANSPORT)(?:\s+CHARGES?)?\b", text))


def generate_chargeback(
    sales_path: str | Path,
    pod_paths: Iterable[str | Path],
    output_path: str | Path,
    *,
    match_level: str = "trx",
    extractor: PodExtractor | None = None,
    line_fallback: str = "trx",
    allow_fallback: bool = False,
    reconciliation_report: str | Path | None = None,
    catalog_map: ControlledCatalogMap | None = None,
    flag_qty_mismatch: bool = False,
) -> int:
    """Generate the chargeback and return the number of POD-backed sales rows."""
    if match_level not in {"trx", "line"}:
        raise ValueError("match_level must be 'trx' or 'line'")
    if line_fallback not in {"trx", "partial", "error"}:
        raise ValueError("line_fallback must be 'trx', 'partial', or 'error'")
    pod_paths = list(map(Path, pod_paths))
    pod_trx = collect_pod_trx_numbers(pod_paths)
    sales_rows, workbook = _read_sales(Path(sales_path))
    try:
        output = Workbook()
        output_sheet = output.active
        output_sheet.title = "Sheet1"
        output_sheet.append(OUTPUT_COLUMNS)
        exceptions_sheet = output.create_sheet("Exceptions") if match_level == "line" else None
        if exceptions_sheet:
            exceptions_sheet.append(EXCEPTION_COLUMNS)
        exceptions: list[dict[str, object]] = []
        fallback_trxs: list[str] = []
        audit: dict[str, object] = {"match_level": match_level, "transactions": {}, "exceptions": exceptions}

        def add_exception(status: str, trx: str, *, reason: str = "",
                          sales: object = None, pod: object = None,
                          candidates: object = None) -> None:
            record = {
                "status": status,
                "TRX": trx,
                "fallback_reason": reason,
                "affected Sales rows": sales if sales is not None else [],
                "extracted POD lines": pod if pod is not None else [],
                "unmatched candidates": candidates if candidates is not None else [],
            }
            exceptions.append(record)
            assert exceptions_sheet is not None
            exceptions_sheet.append([
                record["status"], record["TRX"], record["fallback_reason"],
                _json_cell(record["affected Sales rows"]),
                _json_cell(record["extracted POD lines"]),
                _json_cell(record["unmatched candidates"]),
            ])

        if match_level == "trx":
            # This is the original row-selection and projection behavior.
            selected = [
                row for row in sales_rows
                if _normalise_trx(row.get("TRX #")) in pod_trx
                and _is_target_agency(row.get("Agency"))
            ]
            output_rows_by_trx: dict[str, list[int]] = {}
            for row in selected:
                output_sheet.append(_output_values(row))
                if flag_qty_mismatch:
                    trx = _normalise_trx(row.get("TRX #"))
                    output_rows_by_trx.setdefault(trx, []).append(output_sheet.max_row)
            if flag_qty_mismatch:
                mismatches: list[dict[str, object]] = []
                audit["quantity_review"] = mismatches
                if extractor is None:
                    print("POD extraction is required for the quantity review; skipping review.")
                else:
                    paths_by_trx: dict[str, list[Path]] = {trx: [] for trx in pod_trx}
                    for path in pod_paths:
                        for trx in TRX_PATTERN.findall(path.name):
                            paths_by_trx.setdefault(trx, []).append(path)
                    for trx in sorted(pod_trx):
                        trx_sales = [
                            row for row in selected
                            if _normalise_trx(row.get("TRX #")) == trx
                        ]
                        sales_total = sum(float(row["Quantity"]) for row in trx_sales)
                        pod_total = 0.0
                        for path in paths_by_trx[trx]:
                            result = extractor.extract(path, trx)
                            pod_total += sum(
                                float(line.delivered_quantity)
                                for line in result.lines
                                if line.delivered_quantity is not None
                            )
                        difference = pod_total - sales_total
                        if abs(difference) > 0.001:
                            fill = PatternFill(fill_type="solid", fgColor=QTY_MISMATCH_FILL_COLOR)
                            for row_index in output_rows_by_trx.get(trx, []):
                                for column_index in range(1, len(OUTPUT_COLUMNS) + 1):
                                    output_sheet.cell(row_index, column_index).fill = fill
                            mismatches.append({
                                "trx": trx,
                                "sales_qty_total": sales_total,
                                "pod_qty_total": pod_total,
                                "difference": difference,
                                "pod_files": [str(path) for path in paths_by_trx[trx]],
                            })
                print(f"Quantity review: {len(mismatches)} TRX flagged for POD/Sales quantity mismatch")
        else:
            if extractor is None:
                raise ValueError("line matching requires an extractor")
            catalog_map = catalog_map or ControlledCatalogMap()
            selected = []
            paths_by_trx: dict[str, list[Path]] = {trx: [] for trx in pod_trx}
            for path in pod_paths:
                for trx in TRX_PATTERN.findall(path.name):
                    paths_by_trx.setdefault(trx, []).append(path)
            for trx in sorted(pod_trx):
                trx_sales = [
                    row for row in sales_rows
                    if _normalise_trx(row.get("TRX #")) == trx
                    and _is_target_agency(row.get("Agency"))
                ]
                trx_audit: dict[str, object] = {"pod_files": [str(p) for p in paths_by_trx[trx]]}
                raw_lines: list[PodLine] = []
                try:
                    extracted: list[PodLine] = []
                    extraction_warnings: list[str] = []
                    retain_all = False
                    for path in paths_by_trx[trx]:
                        result = extractor.extract(path, trx)
                        extracted.extend(result.lines)
                        extraction_warnings.extend(result.warnings)
                        retain_all = retain_all or result.retain_all_sales
                    raw_lines = _deduplicate_lines(extracted)
                    normalized_lines = [catalog_map.normalize(line) for line in raw_lines]
                    excluded_lines = [line for line in normalized_lines if _is_excluded_nonchargeback_line(line)]
                    lines = [line for line in normalized_lines if not _is_excluded_nonchargeback_line(line)]
                    for line in excluded_lines:
                        add_exception(
                            "excluded_nonchargeback_line", trx,
                            reason="POD line classified as non-chargeback document context",
                            pod=[asdict(line.raw)],
                        )
                    warning_rule = catalog_map.fallback_warning(extraction_warnings)
                    if warning_rule:
                        trx_audit["fallback_rule"] = warning_rule
                        trx_audit["extraction_warnings"] = extraction_warnings
                        raise ValueError(f"controlled fallback warning: {warning_rule['rule_id']}")
                    if retain_all:
                        raise ValueError("reviewed extraction requests all-Sales TRX fallback")
                    else:
                        matches, ambiguous = _global_assignment(lines, trx_sales)
                        complete = bool(lines) and len(matches) == len(lines) and not ambiguous
                        if not complete:
                            if line_fallback == "trx":
                                fallback_trxs.append(trx)
                                trx_audit["fallback_required"] = True
                            matches = _partial_assignment(lines, trx_sales)
                        if not complete and not matches:
                            raise ValueError("ambiguous or incomplete line assignment")
                        reconciled = []
                        match_audit = []
                        for match in matches:
                            normalized = lines[match.pod_index]
                            line, source = normalized.normalized, trx_sales[match.sales_index]
                            row = dict(source)
                            quantity = _quantity_for_output(line)
                            if quantity is not None:
                                row["Quantity"] = quantity
                            # Preserve Sales identity for GTIN-like extractor values. Controlled
                            # aliases/exceptions and compact manufacturer codes may replace it.
                            output_code = _normalise_code(line.manufacturer_code)
                            if line.manufacturer_code and (len(output_code) <= 10 or normalized.applied_rules):
                                row["Manufacturer"] = line.manufacturer_code
                            # Raw POD EA/PACK labels are evidence, not necessarily the Sales/output
                            # unit. Only a controlled rule is allowed to transform the output UOM.
                            if line.uom and normalized.applied_rules:
                                row["UOM"] = line.uom
                            reconciled.append(row)
                            match_audit.append({
                                "status": "matched",
                                "raw_pod_line": asdict(normalized.raw),
                                "normalized_pod_line": asdict(line),
                                "applied_rules": list(normalized.applied_rules),
                                "sales_manufacturer": source.get("Manufacturer"),
                                "score": match.score, "reasons": match.reasons,
                                "output_quantity": row.get("Quantity"),
                                "conversion": f"delivered_quantity * pack_size({_pack_size(line.uom, line.pack_size):g})",
                            })
                        matched_sales = {match.sales_index for match in matches}
                        if complete and len(matched_sales) == len(trx_sales):
                            status = "line_matched"
                        else:
                            status = "partial"
                            for index, source in enumerate(trx_sales):
                                if index not in matched_sales:
                                    candidate_lines = [{
                                        "pod_line": asdict(item.raw),
                                        "score": _score(item, source)[0],
                                        "reasons": _score(item, source)[1],
                                    } for item in lines]
                                    add_exception(
                                        "unmatched_sales", trx,
                                        reason="No confident reciprocal POD match",
                                        sales=[_sales_audit_row(source)],
                                        pod=[asdict(item.raw) for item in lines],
                                        candidates=candidate_lines,
                                    )
                            matched_pod = {match.pod_index for match in matches}
                            for index, item in enumerate(lines):
                                if index not in matched_pod:
                                    add_exception(
                                        "unmatched_pod", trx,
                                        reason="No confident reciprocal Sales match",
                                        pod=[asdict(item.raw)],
                                        candidates=[{
                                            "sales_row": _sales_audit_row(source),
                                            "score": _score(item, source)[0],
                                            "reasons": _score(item, source)[1],
                                        } for source in trx_sales],
                                    )
                        trx_audit.update(
                            status=status, matches=match_audit,
                            unmatched_pod_lines=len(lines) - len(matches),
                            unmatched_sales=len(trx_sales) - len(matches),
                            normalization=[{
                                "raw_pod_line": asdict(item.raw),
                                "normalized_pod_line": asdict(item.normalized),
                                "applied_rules": list(item.applied_rules),
                            } for item in normalized_lines],
                        )
                    selected.extend(reconciled)
                    for row in reconciled:
                        output_sheet.append(_output_values(row))
                except Exception as exc:
                    if line_fallback == "error":
                        raise ValueError(f"Line reconciliation failed for TRX {trx}: {exc}") from exc
                    if trx not in fallback_trxs:
                        fallback_trxs.append(trx)
                    reason = str(exc)
                    for row in trx_sales:
                        add_exception(
                            "trx_fallback", trx, reason=reason,
                            sales=[_sales_audit_row(row)],
                            pod=[asdict(line) for line in raw_lines],
                            candidates=[_sales_audit_row(candidate) for candidate in trx_sales],
                        )
                    trx_audit.update(status="trx_fallback", fallback_reason=reason,
                                     affected_sales_rows=len(trx_sales), matched=0)
                audit["transactions"][trx] = trx_audit

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output.save(output_path)
        output.close()
        if reconciliation_report:
            report_path = Path(reconciliation_report)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8")
        if match_level == "line" and fallback_trxs and not allow_fallback:
            raise RuntimeError(
                "Line reconciliation produced trx_fallback for "
                f"{len(fallback_trxs)} TRX(s): {', '.join(fallback_trxs)}. "
                "Review the Exceptions sheet or pass --allow-fallback to acknowledge them."
            )
        return len(selected)
    finally:
        workbook.close()


def extract_pod_folder(
    sales_path: str | Path, pod_paths: Iterable[str | Path], output_path: str | Path, *,
    client: GeminiClient | None = None, cache_dir: str | Path = "batches/solventum/.extraction_cache",
    text_extractor: Callable[[Path], str] = _pdftotext,
) -> dict[str, object]:
    """Extract PODs into the reviewable schema consumed by JsonPodExtractor."""
    sales_rows, workbook = _read_sales(Path(sales_path))
    try:
        candidates: dict[str, list[dict[str, object]]] = {}
        for row in sales_rows:
            candidates.setdefault(_normalise_trx(row.get("TRX #")), []).append(row)
    finally:
        workbook.close()
    extractor = GeminiPodExtractor(
        candidates, client=client, cache_dir=cache_dir, text_extractor=text_extractor,
    )
    records: dict[str, object] = {}
    files: list[dict[str, object]] = []
    for pdf_path in map(Path, pod_paths):
        trx_values = TRX_PATTERN.findall(pdf_path.name)
        if not trx_values:
            files.append({"pdf": str(pdf_path), "status": "skipped", "warnings": ["no filename TRX"]})
            continue
        for trx in trx_values:
            result = extractor.extract(pdf_path, trx)
            raw = {
                "authoritative_trx": trx, "document_references": list(result.document_references),
                "lines": [asdict(line) for line in result.lines], "confidence": result.confidence,
                "warnings": list(result.warnings), "extraction_path": result.extraction_path,
                "model": result.model,
            }
            if trx in records:
                prior = records[trx]
                prior["lines"].extend(raw["lines"])
                prior["document_references"] = sorted(set(prior["document_references"] + raw["document_references"]))
                prior["warnings"].append(f"combined extraction from {pdf_path.name}")
            else:
                records[trx] = raw
            files.append({
                "pdf": str(pdf_path), "authoritative_trx": trx, "status": "extracted",
                "extraction_path": result.extraction_path, "model": result.model,
                "confidence": result.confidence, "line_count": len(result.lines),
                "warnings": list(result.warnings),
            })
    payload = {"schema_version": 1, "prompt_version": POD_PROMPT_VERSION, "extractions": records, "files": files}
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sales", required=True, type=Path, help="JUNE SALES workbook")
    parser.add_argument("--pods", required=True, nargs="+", type=Path,
                        help="One or more POD PDFs and/or directories containing POD PDFs")
    parser.add_argument("--out", required=True, type=Path, help="Output .xlsx path")
    parser.add_argument("--match-level", choices=("trx", "line"), default="trx")
    parser.add_argument("--line-fallback", choices=("trx", "partial", "error"), default="trx")
    parser.add_argument("--allow-fallback", action="store_true",
                        help="Allow trx_fallback rows to remain in the labeled Exceptions sheet")
    parser.add_argument("--extraction-json", type=Path,
                        help="Reviewed extraction JSON (required for --match-level line)")
    parser.add_argument("--reconciliation-report", type=Path, help="Optional audit JSON path")
    parser.add_argument(
        "--flag-qty-mismatch", action="store_true",
        help="Compare TRX-level Sales and extracted POD quantities in the audit JSON",
    )
    return parser


def build_extract_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Extract POD PDFs to reviewable JSON")
    parser.add_argument("--sales", required=True, type=Path, help="Sales workbook")
    parser.add_argument("--pods", required=True, nargs="+", type=Path, help="POD PDFs and/or directories")
    parser.add_argument("--out-extraction", required=True, type=Path, help="Reviewable extraction JSON")
    parser.add_argument("--cache-dir", type=Path, default=Path("batches/solventum/.extraction_cache"))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    argv = list(argv) if argv is not None else None
    if argv is None:
        import sys
        argv = sys.argv[1:]
    if argv and argv[0] == "extract":
        args = build_extract_parser().parse_args(argv[1:])
        pods = expand_pod_arguments(args.pods)
        payload = extract_pod_folder(args.sales, pods, args.out_extraction, cache_dir=args.cache_dir)
        text_count = sum(item.get("extraction_path") == "text" for item in payload["files"])
        vision_count = sum(item.get("extraction_path") == "vision" for item in payload["files"])
        for item in payload["files"]:
            print(f"{Path(item['pdf']).name}: {item.get('extraction_path', item['status'])} confidence={item.get('confidence')} warnings={item.get('warnings', [])}")
        print(f"Extracted {len(payload['extractions'])} TRXs ({text_count} text, {vision_count} vision): {args.out_extraction}")
        return 0
    args = build_parser().parse_args(argv)
    pods = expand_pod_arguments(args.pods)
    extractor = JsonPodExtractor(args.extraction_json) if args.extraction_json else None
    row_count = generate_chargeback(
        args.sales, pods, args.out, match_level=args.match_level, extractor=extractor,
        line_fallback=args.line_fallback, allow_fallback=args.allow_fallback,
        reconciliation_report=args.reconciliation_report,
        flag_qty_mismatch=args.flag_qty_mismatch,
    )
    print(f"Generated {row_count} POD-backed chargeback rows: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
