import os

# 1. Patch cost_center_resolver.py
file1 = "/home/clawdbot/.openclaw/workspace/aljeel/scripts/cost_center_resolver.py"
with open(file1, "r") as f:
    c1 = f.read()

target1 = """        raw_loc = str(int(emp.location)).strip() if emp.location else ""
        if raw_loc == "10100":
            location = "20100"
        elif raw_loc in ("30100", "40100"):
            location = raw_loc
        else:
            # Fallback to itinerary if Manpower is missing or invalid
            _loc_code, _, _loc_flag = _resolve_location_v15_7(description)
            location = _loc_code"""

replacement1 = """        raw_loc = str(int(emp.location)).strip() if emp.location else ""
        if raw_loc:
            location = raw_loc
        else:
            # Fallback to itinerary if Manpower is missing or invalid
            _loc_code, _, _loc_flag = _resolve_location_v15_7(description)
            location = _loc_code"""

if target1 in c1:
    c1 = c1.replace(target1, replacement1)
    with open(file1, "w") as f:
        f.write(c1)
    print("Patched cost_center_resolver.py")
else:
    print("Could not find target1 in cost_center_resolver.py")

# 2. Patch run_v30.py
file2 = "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py"
with open(file2, "r") as f:
    c2 = f.read()

target2 = """                if _emp_no in _loc_map:
                    _l = _loc_map[_emp_no]
                    if _l == "10100": _new_loc = "20100"
                    elif _l in ("30100", "40100"): _new_loc = _l
                    else: _new_loc = _parts[1]
                else:
                    _new_loc = _parts[1]
                if _new_loc == "10100": _new_loc = "20100"
                _parts[1] = _new_loc"""

replacement2 = """                if _emp_no in _loc_map:
                    _l = _loc_map[_emp_no]
                    if _l:
                        _new_loc = _l
                    else:
                        _new_loc = _parts[1]
                else:
                    _new_loc = _parts[1]
                _parts[1] = _new_loc"""

if target2 in c2:
    c2 = c2.replace(target2, replacement2)
    with open(file2, "w") as f:
        f.write(c2)
    print("Patched run_v30.py")
else:
    print("Could not find target2 in run_v30.py")

