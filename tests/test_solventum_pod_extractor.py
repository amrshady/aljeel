import json
from pathlib import Path

from scripts.solventum_chargeback import GeminiPodExtractor


class FakeGeminiClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def generate(self, model, prompt, pdf_bytes):
        self.calls.append((model, prompt, pdf_bytes))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def _vision_payload():
    return {
        "authoritative_trx": "wrong-document-reference",
        "document_references": ["4600162237", "260009137"],
        "confidence": 0.91,
        "warnings": [],
        "lines": [{
            "catalog_code": "1470A2", "manufacturer_code": None,
            "trade_item_number": "4215245303301", "description": "FILTEK Z250 1470A2",
            "lot": None, "delivered_quantity": 30, "uom": None,
            "pack_size": None, "source_page": 1, "confidence": 0.94,
        }],
    }


def test_filename_trx_is_authoritative_and_nullable_fields_are_accepted(tmp_path):
    pdf = tmp_path / "2600015875 checked.pdf"
    pdf.write_bytes(b"fake pdf")
    client = FakeGeminiClient([_vision_payload()])
    extractor = GeminiPodExtractor({}, client=client, cache_dir=tmp_path / "cache", text_extractor=lambda _: "")

    result = extractor.extract(pdf, "2600015875")

    assert result.authoritative_trx == "2600015875"
    assert result.document_references == ("4600162237", "260009137")
    assert result.lines[0].lot is None
    assert result.lines[0].manufacturer_code is None
    assert result.lines[0].uom is None
    assert "authoritative Sales TRX is 2600015875" in client.calls[0][1]


def test_cache_hit_skips_client(tmp_path):
    pdf = tmp_path / "2600015875.pdf"
    pdf.write_bytes(b"same pdf")
    first = FakeGeminiClient([_vision_payload()])
    GeminiPodExtractor({}, client=first, cache_dir=tmp_path / "cache", text_extractor=lambda _: "").extract(pdf, "2600015875")
    second = FakeGeminiClient([])

    result = GeminiPodExtractor({}, client=second, cache_dir=tmp_path / "cache", text_extractor=lambda _: "").extract(pdf, "2600015875")

    assert result.extraction_path == "vision"
    assert second.calls == []


def test_confident_text_table_skips_vision(tmp_path):
    pdf = tmp_path / "2600015875.pdf"
    pdf.write_bytes(b"fake")
    text = """
Trade Item No.  Description Qty UOM
1 10 4215245303301 FILTEK Z250 1470A2 3M ESPE 30 EA 55.00
PO No. 4600162237
"""
    client = FakeGeminiClient([])

    result = GeminiPodExtractor({}, client=client, cache_dir=tmp_path / "cache", text_extractor=lambda _: text).extract(pdf, "2600015875")

    assert result.extraction_path == "text"
    assert result.lines[0].delivered_quantity == 30
    assert result.lines[0].uom == "EA"
    assert client.calls == []


def test_insufficient_text_uses_flash_then_pro(tmp_path):
    pdf = tmp_path / "2600015875.pdf"
    pdf.write_bytes(b"fake")
    client = FakeGeminiClient([RuntimeError("flash unavailable"), _vision_payload()])

    result = GeminiPodExtractor({}, client=client, cache_dir=tmp_path / "cache", text_extractor=lambda _: "scanned page").extract(pdf, "2600015875")

    assert result.extraction_path == "vision"
    assert result.model == "gemini-2.5-pro"
    assert [call[0] for call in client.calls] == ["gemini-2.5-flash", "gemini-2.5-pro"]


def test_candidate_sales_are_prompt_context_but_not_output(tmp_path):
    pdf = tmp_path / "2600015875.pdf"
    pdf.write_bytes(b"fake")
    candidates = {"2600015875": [{"Item Description": "candidate", "Manufacturer": "1954", "Lot Number": None, "Quantity": 3000, "UOM": "Box-1"}]}
    client = FakeGeminiClient([_vision_payload()])

    GeminiPodExtractor(candidates, client=client, cache_dir=tmp_path / "cache", text_extractor=lambda _: "").extract(pdf, "2600015875")

    prompt = client.calls[0][1]
    assert '"Manufacturer": "1954"' in prompt
    assert "Report only item lines actually shown" in prompt
