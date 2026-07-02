import os

filepath = "/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py"
with open(filepath, "r") as f:
    content = f.read()

target = """        subprocess.run(["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/seed_audit_db.py"])
        subprocess.run(["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/export_audit_json.py"])"""

replacement = """        subprocess.run(["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/seed_audit_db.py"])
        subprocess.run(["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/export_audit_json.py"])
        
        # Prevent Cloudflare 25MB deploy limit crash
        if os.path.exists("/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/data/audit_runs.db"):
            os.remove("/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/data/audit_runs.db")"""

if target in content:
    content = content.replace(target, replacement)
    with open(filepath, "w") as f:
        f.write(content)
    print("Patched droplet API to remove db before deploy.")
else:
    print("Could not find target block.")
