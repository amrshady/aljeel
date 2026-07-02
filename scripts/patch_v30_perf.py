import os

filepath = "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py"
with open(filepath, "r") as f:
    content = f.read()

old_code = """    # Step 4: Strict PDF Scanner (Cross-Contamination Fix)
    if ticket_no:
        import pypdf
        for f in all_folders:
            if not f.is_dir(): continue
            try:
                for child in f.iterdir():
                    if child.name.upper().endswith(".PDF"):
                        try:
                            reader = pypdf.PdfReader(str(child))
                            for i in range(min(2, len(reader.pages))):
                                text = reader.pages[i].extract_text()
                                if text and ticket_no in text:
                                    return f
                        except Exception: pass
            except Exception: pass

    # Step 5: Strict MSG Scanner
    if ticket_no:
        for f in all_folders:
            if not f.is_dir(): continue
            try:
                for child in f.iterdir():
                    if child.name.upper().endswith(".MSG"):
                        try:
                            with open(child, "rb") as msg_f:
                                content = msg_f.read().decode("utf-8", errors="ignore")
                                if ticket_no in content:
                                    return f
                        except Exception: pass
            except Exception: pass

    return None"""

new_code = """    # GLOBAL CACHE FOR FILE TEXT TO PREVENT O(N*M) HANG
    if not hasattr(find_folder_v25, "_file_text_cache"):
        find_folder_v25._file_text_cache = {}
        find_folder_v25._scanned = False

    # Step 4: Strict Scanner with Cache
    if ticket_no:
        if not find_folder_v25._scanned:
            import pypdf
            for f in all_folders:
                if not f.is_dir(): continue
                for child in f.iterdir():
                    cn = child.name.upper()
                    if cn.endswith(".PDF"):
                        try:
                            reader = pypdf.PdfReader(str(child))
                            full_text = []
                            for i in range(min(2, len(reader.pages))):
                                extracted = reader.pages[i].extract_text()
                                if extracted:
                                    full_text.append(extracted)
                            find_folder_v25._file_text_cache[child] = (" ".join(full_text), f)
                        except Exception: pass
                    elif cn.endswith(".MSG"):
                        try:
                            with open(child, "rb") as msg_f:
                                txt = msg_f.read().decode("utf-8", errors="ignore")
                                find_folder_v25._file_text_cache[child] = (txt, f)
                        except Exception: pass
            find_folder_v25._scanned = True
            
        for path, (text, f) in find_folder_v25._file_text_cache.items():
            if ticket_no in text:
                return f

    return None"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open(filepath, "w") as f:
        f.write(content)
    print("Optimization patch applied successfully.")
else:
    print("Could not find the target code to patch.")

