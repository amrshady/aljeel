import subprocess
import time

commands = [
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-550", "--input-suffix", "v15.11.2", "--use-cache"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-589", "--input-suffix", "v15.11.2", "--use-cache"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-593", "--input-suffix", "v15.11.2", "--use-cache"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-640", "--input-suffix", "v15.11.2", "--use-cache"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-788", "--input-suffix", "v15.11.2", "--use-cache"]
]

print("Starting v30 runs (with cache) for all 5 batches in parallel to propagate 10100...")
processes = []
for cmd in commands:
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    processes.append((cmd[2], p))

completed = 0
n_proc = len(processes)
while completed < n_proc:
    completed = 0
    for batch_id, p in processes:
        ret = p.poll()
        if ret is not None:
            completed += 1
    time.sleep(2)

print("\n=== ALL V30 RUNS COMPLETE ===")
for batch_id, p in processes:
    out, err = p.communicate()
    print(f"--- Batch {batch_id} Exit Code: {p.returncode} ---")
    if p.returncode != 0:
        print("ERROR:", err)
