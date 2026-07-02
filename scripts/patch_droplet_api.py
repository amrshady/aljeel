filepath = "/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py"
with open(filepath, "r") as f:
    content = f.read()

target = """        subprocess.run(["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/export_audit_json.py"])"""
replacement = """        subprocess.run(["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/export_audit_json.py"])
        
        # COPY EXCEL TO PUBLIC OUTPUTS SO IT CAN BE DOWNLOADED!
        import shutil
        src_xlsx = f"/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-{batch_id}/output/Spreadsheet-{batch_id}-FILLED-v30.xlsx"
        dst_xlsx = f"/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/outputs/Spreadsheet-{batch_id}-FILLED-v30.xlsx"
        if os.path.exists(src_xlsx):
            shutil.copy2(src_xlsx, dst_xlsx)
            yield f"data: [API] Copied {batch_id} spreadsheet to public outputs.\\n\\n"
"""

if target in content:
    content = content.replace(target, replacement)
    with open(filepath, "w") as f:
        f.write(content)
    print("Patched droplet API to copy xlsx.")
else:
    print("Could not find target in droplet API.")

