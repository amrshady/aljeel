import subprocess
import time
import sys

commands = [
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-550", "--input-suffix", "v15.12", "--workers", "10"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-589", "--input-suffix", "v15.11.2", "--workers", "10"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-593", "--input-suffix", "v15.11.2", "--workers", "10"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-640", "--input-suffix", "v15.12", "--workers", "10"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", "J26-788", "--input-suffix", "v15.11.2", "--workers", "10"]
]

print("Starting fresh, non-biased run of all 5 batches in parallel...")
processes = []
for cmd in commands:
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    processes.append((cmd[2], p))

# Poll processes
completed = 0
n_proc = len(processes)
while completed < n_proc:
    completed = 0
    for batch_id, p in processes:
        ret = p.poll()
        if ret is not None:
            completed += 1
    print(f"Polling runs... Completed: {completed}/{n_proc}")
    time.sleep(15)

print("\n=== RUN ALL COMPLETE ===")
for batch_id, p in processes:
    out, err = p.communicate()
    print(f"--- Batch {batch_id} Exit Code: {p.returncode} ---")
    if p.returncode != 0:
        print("ERROR:", err)
    else:
        # Print summary section if possible
        summary_lines = [line for line in out.splitlines() if "done" in line or "Rows:" in line or "Score" in line or "Output:" in line]
        print("\n".join(summary_lines[:15]))
