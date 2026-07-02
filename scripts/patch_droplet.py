import os

filepath = "/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py"
with open(filepath, "r") as f:
    content = f.read()

target = """    def generate():
        yield f"data: [API] Starting pipeline for {batch_id} (Cache {'Disabled' if no_cache else 'Enabled'})...\\n\\n"
        
        cmd = ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", batch_id, "--input-suffix", "v15.11.2"]
        if no_cache:
            cmd.append("--no-cache")
            
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in iter(proc.stdout.readline, ''):
            yield f"data: {line.strip()}\\n\\n"
        proc.wait()
        
        if proc.returncode != 0:
            yield f"data: [API] Pipeline failed with code {proc.returncode}\\n\\n"
            yield "data: [END]\\n\\n"
            return"""

replacement = """    def generate():
        yield f"data: [API] Starting ZERO-CACHE FULL PIPELINE for {batch_id}...\\n\\n"
        
        # STAGE 1: Cascade
        yield f"data: [API] >> STAGE 1: Generating fresh deterministic cascade from raw excel...\\n\\n"
        cmd1 = ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py", "--batch", f"/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-{batch_id}", "--suffix", "v15.11.2"]
        proc1 = subprocess.Popen(cmd1, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in iter(proc1.stdout.readline, ''):
            yield f"data: {line.strip()}\\n\\n"
        proc1.wait()

        if proc1.returncode != 0:
            yield f"data: [API] Stage 1 (Cascade) failed with code {proc1.returncode}\\n\\n"
            yield "data: [END]\\n\\n"
            return

        # STAGE 2: LLM v30 Exception Handler
        yield f"data: [API] >> STAGE 2: Running LLM Exception Handler (v30) strictly from scratch (NO CACHE)...\\n\\n"
        cmd2 = ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", batch_id, "--input-suffix", "v15.11.2", "--no-cache"]
        proc2 = subprocess.Popen(cmd2, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in iter(proc2.stdout.readline, ''):
            yield f"data: {line.strip()}\\n\\n"
        proc2.wait()
        
        if proc2.returncode != 0:
            yield f"data: [API] Stage 2 (LLM Pipeline) failed with code {proc2.returncode}\\n\\n"
            yield "data: [END]\\n\\n"
            return"""

if target in content:
    content = content.replace(target, replacement)
    with open(filepath, "w") as f:
        f.write(content)
    print("Patched droplet API.")
else:
    print("Could not find target block.")
