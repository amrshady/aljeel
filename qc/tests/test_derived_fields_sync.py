#!/usr/bin/env python3
import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

from cost_center_resolver import sync_row_derived_fields


class FakeLookup:
    def expand_combo(self, combo, resolved_line=None):
        parts = combo.split("-")
        account = parts[2]
        cost_center = parts[3]
        return {
            "GL": {
                "60301003": "Travel Expenses",
                "60307021": "Sponsoring Expenses",
            }.get(account, "#N/A"),
            "Cost Name": {
                "160014": "Marketing Events",
                "160011": "Shared OPEX",
            }.get(cost_center, "#N/A"),
            "Contribution": "Sales and Marketing",
            "Solution Name": "CRM",
            "Agency Name": "Abbott",
        }


class TestDerivedFieldSync(unittest.TestCase):
    def test_sync_after_segment_override(self):
        row = SimpleNamespace(
            company="03",
            location="20100",
            account="60301003",
            cost_center="160014",
            div="170",
            solution="10017",
            agency="10072",
            project="00000",
            intercompany="00",
            future1="000000",
            combo="stale",
            gl_description="stale",
        )

        row.account = "60307021"
        row.cost_center = "160011"

        sync_row_derived_fields(row, FakeLookup())

        self.assertEqual(
            row.combo,
            "03-20100-60307021-160011-170-10017-10072-00000-00-000000",
        )
        self.assertIn("Sponsoring Expenses", row.gl_description)
        self.assertIn("Shared OPEX", row.gl_description)
        self.assertTrue(row.gl_description.endswith("· 00000 · 00 · 000000"))


if __name__ == "__main__":
    unittest.main()
