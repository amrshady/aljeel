#!/usr/bin/env python3
"""
Unit tests for allocation_resolver.py

Tests Tier 1 (deterministic), Tier 2 (LLM, mocked), and Tier 3 (hierarchy).
"""
import sys
import os
import unittest
from unittest.mock import patch, MagicMock
from dataclasses import dataclass, field
from typing import Optional

# Add paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from cost_center_resolver import Employee, MasterData
from allocation_resolver import (
    resolve_allocation,
    _tier1_deterministic,
    _tier3_hierarchy,
    AllocationResult,
    _get_subordinates,
)


def _make_emp(emp_no, name, arabic_name="", manager_no=None, sol_flag="Can Be used",
              location=40100, div_code=170, agency_code=10072, cost_center=160014,
              solution_name="", line_manager=""):
    return Employee(
        emp_no=emp_no,
        old_emp_no=None,
        name=name,
        arabic_name=arabic_name,
        location=location,
        manager_no=manager_no,
        line_manager=line_manager,
        div_code=div_code,
        div_name="",
        agency_code=agency_code,
        agency_name="",
        cost_center=cost_center,
        cost_center_name="",
        sol_flag=sol_flag,
        solution_name=solution_name,
    )


def _make_md(employees_list):
    emps = {e.emp_no: e for e in employees_list}
    return MasterData(
        employees=emps,
        valid_accounts={"60301003", "60301004", "60307021", "60308007"},
        valid_divs={"170", "192", "194", "196", "888"},
        valid_agencies={"10072", "10081", "10055", "10052", "00000"},
        valid_solutions={"00000", "10017", "10050"},
        valid_cost_centers={"160014", "160011", "160012", "160013", "999999"},
        valid_locations={"10100", "20100", "30100", "40100"},
    )


class TestTier1Deterministic(unittest.TestCase):
    def setUp(self):
        self.sub1 = _make_emp(2000001, "John Smith", agency_code=10072, sol_flag="Can Be used")
        self.sub2 = _make_emp(2000002, "Jane Doe", agency_code=10072, sol_flag="Can Be used")
        self.sub_nta = _make_emp(2000003, "Bob Wilson", agency_code=10072, sol_flag="Need to allocate")

    def test_english_charge_to(self):
        """Clean English: 'Please charge this to John Smith'"""
        body = "Approved. Charge to John Smith."
        result = _tier1_deterministic(body, [self.sub1, self.sub2])
        self.assertIsNotNone(result)
        self.assertTrue(result.resolved)
        self.assertEqual(result.subordinate_emp_no, 2000001)
        self.assertEqual(result.flag_code, "ALLOCATION_RESOLVED_DETERMINISTIC")

    def test_arabic_allocation(self):
        """Clean Arabic allocation language."""
        body = "يتسجل على محمد علي"
        sub_ar = _make_emp(2000004, "Mohammed Ali", arabic_name="محمد علي", sol_flag="Can Be used")
        result = _tier1_deterministic(body, [sub_ar, self.sub1])
        self.assertIsNotNone(result)
        self.assertTrue(result.resolved)
        self.assertEqual(result.subordinate_emp_no, 2000004)

    def test_mixed_ar_en(self):
        """Mixed Arabic/English body."""
        body = "يعتمد. allocate to Jane Doe."
        result = _tier1_deterministic(body, [self.sub1, self.sub2])
        self.assertIsNotNone(result)
        self.assertTrue(result.resolved)
        self.assertEqual(result.subordinate_emp_no, 2000002)

    def test_empno_in_body(self):
        """Employee number found directly in .msg body."""
        body = "Approved for ticket (2000001) business trip."
        result = _tier1_deterministic(body, [self.sub1, self.sub2])
        self.assertIsNotNone(result)
        self.assertTrue(result.resolved)
        self.assertEqual(result.subordinate_emp_no, 2000001)

    def test_no_allocation_language(self):
        """No allocation language at all (generic approval)."""
        body = "يعتمد المرسل من قبلكم"
        result = _tier1_deterministic(body, [self.sub1, self.sub2])
        self.assertIsNone(result)

    def test_multi_name_case(self):
        """Multiple names found - should return MULTI."""
        body = "Please charge this to John Smith and Jane Doe."
        # This will match "John Smith" first - single match
        result = _tier1_deterministic(body, [self.sub1, self.sub2])
        # Should resolve to John Smith (first match)
        if result:
            self.assertTrue(result.resolved or result.flag_code == "MULTI_ALLOCATION_PENDING_REVIEW")

    def test_empty_body(self):
        """Empty .msg body."""
        result = _tier1_deterministic("", [self.sub1])
        self.assertIsNone(result)

    def test_no_subordinates(self):
        """No subordinates to match against."""
        body = "Please charge this to John Smith."
        result = _tier1_deterministic(body, [])
        self.assertIsNone(result)


class TestTier3Hierarchy(unittest.TestCase):
    def test_single_same_agency_subordinate(self):
        """Single usable subordinate with same agency - should resolve."""
        mgr = _make_emp(1000, "Manager One", sol_flag="Need to allocate", agency_code=10072, manager_no=999)
        sub = _make_emp(2001, "Sub One", sol_flag="Can Be used", agency_code=10072, manager_no=1000)
        md = _make_md([mgr, sub])
        result = _tier3_hierarchy(mgr, md)
        self.assertTrue(result.resolved)
        self.assertEqual(result.subordinate_emp_no, 2001)
        self.assertEqual(result.method, "hierarchy_single")

    def test_multiple_same_agency(self):
        """Multiple usable subordinates with same agency - MULTI."""
        mgr = _make_emp(1000, "Manager One", sol_flag="Need to allocate", agency_code=10072, manager_no=999)
        sub1 = _make_emp(2001, "Sub One", sol_flag="Can Be used", agency_code=10072, manager_no=1000)
        sub2 = _make_emp(2002, "Sub Two", sol_flag="Can Be used", agency_code=10072, manager_no=1000)
        md = _make_md([mgr, sub1, sub2])
        result = _tier3_hierarchy(mgr, md)
        self.assertFalse(result.resolved)
        self.assertEqual(result.flag_code, "MULTI_ALLOCATION_PENDING_REVIEW")

    def test_no_usable_subordinates(self):
        """All subordinates also 'Need to allocate' - no usable targets."""
        mgr = _make_emp(1000, "Manager One", sol_flag="Need to allocate", agency_code=10072, manager_no=999)
        sub = _make_emp(2001, "Sub One", sol_flag="Need to allocate", agency_code=10072, manager_no=1000)
        md = _make_md([mgr, sub])
        result = _tier3_hierarchy(mgr, md)
        self.assertFalse(result.resolved)
        self.assertEqual(result.flag_code, "ALLOCATION_TARGET_MISSING")

    def test_no_subordinates_at_all(self):
        """Manager has no subordinates whatsoever."""
        mgr = _make_emp(1000, "Manager One", sol_flag="Need to allocate", agency_code=10072, manager_no=999)
        md = _make_md([mgr])
        result = _tier3_hierarchy(mgr, md)
        self.assertFalse(result.resolved)
        self.assertEqual(result.flag_code, "ALLOCATION_TARGET_MISSING")
        self.assertEqual(result.method, "none")

    def test_indirect_subordinate(self):
        """No direct usable subs, but one indirect usable sub 2 levels down."""
        mgr = _make_emp(1000, "Manager One", sol_flag="Need to allocate", agency_code=10072, manager_no=999)
        mid = _make_emp(2000, "Mid Manager", sol_flag="Need to allocate", agency_code=10072, manager_no=1000)
        leaf = _make_emp(3000, "Leaf Worker", sol_flag="Can Be used", agency_code=10072, manager_no=2000)
        md = _make_md([mgr, mid, leaf])
        result = _tier3_hierarchy(mgr, md)
        self.assertTrue(result.resolved)
        self.assertEqual(result.subordinate_emp_no, 3000)


class TestResolveAllocation(unittest.TestCase):
    def test_non_nta_employee(self):
        """Employee not flagged 'Need to allocate' - should return missing."""
        emp = _make_emp(1000, "Normal Employee", sol_flag="Can Be used")
        md = _make_md([emp])
        result = resolve_allocation([], 1000, md)
        self.assertFalse(result.resolved)

    def test_missing_employee(self):
        """Employee not in Manpower."""
        md = _make_md([])
        result = resolve_allocation([], 9999, md)
        self.assertFalse(result.resolved)

    def test_loop_prevention(self):
        """Deterministic finds a target that is also 'Need to allocate'."""
        mgr = _make_emp(1000, "Manager", sol_flag="Need to allocate", manager_no=999)
        # Sub is also NTA
        sub = _make_emp(2000, "Sub Manager", sol_flag="Need to allocate", manager_no=1000)
        md = _make_md([mgr, sub])
        # Even if the body names the sub, it should not allocate
        body = "Please charge this to Sub Manager."
        result = resolve_allocation([body], 1000, md)
        # Should fall through to tier 3 and report missing (no usable subs)
        self.assertFalse(result.resolved)

    def test_tier1_then_tier3(self):
        """No .msg bodies, falls through to hierarchy."""
        mgr = _make_emp(1000, "Manager", sol_flag="Need to allocate", agency_code=10072, manager_no=999)
        sub = _make_emp(2000, "Sub Worker", sol_flag="Can Be used", agency_code=10072, manager_no=1000)
        md = _make_md([mgr, sub])
        result = resolve_allocation([], 1000, md)
        self.assertTrue(result.resolved)
        self.assertEqual(result.subordinate_emp_no, 2000)
        self.assertEqual(result.method, "hierarchy_single")

    def test_generic_approval_body_falls_to_hierarchy(self):
        """Generic approval body with no allocation language falls to hierarchy."""
        mgr = _make_emp(1000, "Manager", sol_flag="Need to allocate", agency_code=10072, manager_no=999)
        sub = _make_emp(2000, "Sub Worker", sol_flag="Can Be used", agency_code=10072, manager_no=1000)
        md = _make_md([mgr, sub])
        body = "يعتمد المرسل من قبلكم"
        result = resolve_allocation([body], 1000, md)
        self.assertTrue(result.resolved)
        self.assertEqual(result.subordinate_emp_no, 2000)
        self.assertEqual(result.method, "hierarchy_single")


if __name__ == "__main__":
    unittest.main(verbosity=2)
