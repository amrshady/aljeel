filepath = "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py"
with open(filepath, "r") as f:
    content = f.read()

old_lines = """    no_cache = not args.use_cache
    if no_cache:
        print("[llm] cache DISABLED — all LLM calls will be fresh", flush=True)"""
new_lines = """    no_cache = True if getattr(args, 'no_cache', False) else (not args.use_cache)
    if no_cache:
        print("[llm] cache DISABLED — all LLM calls will be fresh", flush=True)"""

if old_lines in content:
    content = content.replace(old_lines, new_lines)
    with open(filepath, "w") as f:
        f.write(content)
    print("Patched boolean logic.")
else:
    print("Could not find the target code.")
