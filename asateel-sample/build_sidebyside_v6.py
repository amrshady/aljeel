#!/usr/bin/env python3
"""Build the v6 side-by-side Finance comparison workbook."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("build_sidebyside_v5", HERE / "build_sidebyside_v5.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load build_sidebyside_v5.py")

mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)

mod.V5_PATH = mod.POC_OUT / "asateel-poc-oracle-CENTRAL-full-v6-2026-06-23.xlsx"
mod.OUT_XLSX = mod.POC_OUT / "asateel-sidebyside-v6-2026-06-23.xlsx"
mod.OUT_MD = mod.ROOT / "asateel-sample/COMPARE-REPORT-v6-2026-06-23.md"

mod.main()
