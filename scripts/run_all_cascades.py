import subprocess
import time

commands = [
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py", "--batch", "/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-550", "--suffix", "v15.11.2"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py", "--batch", "/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-589", "--suffix", "v15.11.2"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py", "--batch", "/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-593", "--suffix", "v15.11.2"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py", "--batch", "/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-640", "--suffix", "v15.11.2"],
    ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py", "--batch", "/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-788", "--suffix", "v15.11.2"]
]

print("Starting fresh Stage A cascade generation for all 5 batches in parallel...")
processes = []
for cmd in commands:
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    processes.append((cmd[3], p))

# Poll processes
completed = 0
n_proc = len(processes)
while completed < n_proc:
    completed = 0
    for batch_path, p in processes:
        ret = p.poll()
        if ret is not None:
            completed += 1
    time.sleep(2)

print("\n=== ALL CASCADE RUNS COMPLETE ===")
for batch_path, p in processes:
    out, err = p.communicate()
    batch_id = batch_path.split("/")[-1]
    print(f"--- Batch {batch_id} Exit Code: {p.returncode} ---")
    if p.returncode != 0:
        print("ERROR:", err)
    else:
        print(f"Batch {batch_id} generated successfully!")
