filepath = "/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html"
with open(filepath, "r") as f:
    content = f.read()

target = """<button class="btn btn-primary" id="btn-run" style="width: 100%;" disabled>Run AP Agent Pipeline</button>"""
replacement = """
        <div style="display: flex; gap: 10px; align-items: center;">
          <button class="btn btn-primary" id="btn-run" style="flex: 1;" disabled>Run AP Agent Pipeline</button>
          <label style="font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 4px; cursor: pointer;">
            <input type="checkbox" id="checkbox-no-cache"> Force Fresh LLM (No Cache)
          </label>
        </div>"""

if target in content:
    content = content.replace(target, replacement)
    with open(filepath, "w") as f:
        f.write(content)
    print("Added checkbox.")
