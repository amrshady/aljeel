filepath = "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py"
with open(filepath, "r") as f:
    content = f.read()

target = """    # ── stage 4.5: v26 — GL Description trailing zeros ──────────────────────────"""
replacement = """    # ── stage 4.4: v30 — Force rewrite cascade locations from Manpower ───────────
    try:
        _wb_loc = openpyxl.load_workbook(out_xlsx)
        _ws_loc = _wb_loc.active
        
        # Load manpower quickly
        import pandas as pd
        _df_m = pd.read_excel('/home/clawdbot/.openclaw/workspace/aljeel/qc/master-data/Aljeel_Lookups-v2.xlsx', sheet_name='Manpower')
        _loc_map = {}
        for _, _row in _df_m.iterrows():
            _emp_raw = _row.iloc[0]
            _loc_raw = _row.iloc[4]
            if pd.notna(_emp_raw):
                try:
                    _loc_map[str(int(_emp_raw))] = str(int(_loc_raw)) if pd.notna(_loc_raw) else ""
                except:
                    pass
                    
        for _r in range(4, _ws_loc.max_row+1):
            _combo = str(_ws_loc.cell(_r, 14).value)
            _emp_no = str(_ws_loc.cell(_r, 16).value) if _ws_loc.cell(_r, 16).value else ""
            if _combo and len(_combo.split('-')) == 10:
                _parts = _combo.split('-')
                _new_loc = "20100"
                if _emp_no in _loc_map:
                    _l = _loc_map[_emp_no]
                    if _l == "10100": _new_loc = "20100"
                    elif _l in ("30100", "40100"): _new_loc = _l
                    else: _new_loc = _parts[1]
                else:
                    _new_loc = _parts[1]
                if _new_loc == "10100": _new_loc = "20100"
                _parts[1] = _new_loc
                _ws_loc.cell(_r, 14).value = "-".join(_parts)
        _wb_loc.save(str(out_xlsx))
        print("[v30-loc] Cascade locations explicitly rewritten from Manpower", flush=True)
    except Exception as e:
        print(f"[v30-loc] Error rewriting locations: {e}", flush=True)

    # ── stage 4.5: v26 — GL Description trailing zeros ──────────────────────────"""

if target in content:
    content = content.replace(target, replacement)
    with open(filepath, "w") as f:
        f.write(content)
    print("Patched v30 location rewrite.")
