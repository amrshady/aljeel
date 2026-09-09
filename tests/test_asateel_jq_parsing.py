import sys
from pathlib import Path

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipelines import asateel


def test_bare_nine_digit_jq_canonicalizes():
    engine = asateel._load_v6_engine()

    assert engine._canonical_jq("260009694") == "JQ-260009694"
    assert engine._split_jqs("260009694") == ["JQ-260009694"]


def test_space_separated_bare_nine_digit_jqs_are_split_and_deduplicated():
    engine = asateel._load_v6_engine()

    assert engine._split_jqs("260009694 260009787 260009694 260010529") == [
        "JQ-260009694",
        "JQ-260009787",
        "JQ-260010529",
    ]


def test_bare_nine_digit_supplier_jqs_match_bare_so_detail_rows(tmp_path, monkeypatch):
    engine = asateel._load_v6_engine()
    workbook_path = tmp_path / "so_detail.xlsx"
    workbook = openpyxl.Workbook()
    worksheet = workbook.active
    worksheet.append(["ORDER_NUMBER", "SPERSON", "CAT_AGENCY", "CAT_AGENCY_DESC"])
    worksheet.append(["260009694", "1001686-BMX", "10153", "BMX"])
    worksheet.append(["260009787", "1001686-BMX", "10153", "BMX"])
    worksheet.append(["260010529", "1001686-BMX", "10153", "BMX"])
    workbook.save(workbook_path)
    workbook.close()
    monkeypatch.setattr(engine, "SO_DETAIL_CACHE_DIR", tmp_path / "cache")

    index = engine.load_so_detail(workbook_path)
    supplier_jqs = engine._split_jqs("260009694 260009787 260010529")

    assert [index[jq]["agency_code"] for jq in supplier_jqs] == ["10153"] * 3
    assert [index[jq]["agency_desc"] for jq in supplier_jqs] == ["BMX"] * 3


def test_existing_bare_and_prefixed_jq_behavior_is_preserved():
    engine = asateel._load_v6_engine()

    assert engine._canonical_jq("1") == "JQ-00000001"
    assert engine._canonical_jq("12345678") == "JQ-12345678"
    assert engine._split_jqs("1") == ["JQ-00000001"]
    assert engine._split_jqs("1 12345678") == ["JQ-00000001", "JQ-12345678"]
    assert engine._split_jqs("JQ-1 JQ-12345678 JQ-1") == [
        "JQ-00000001",
        "JQ-12345678",
    ]
