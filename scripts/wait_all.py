import time
import os

batches = ["J26-589", "J26-593", "J26-640", "J26-788"]
logs = [f"/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-{b}/output/run_v30_patch.log" for b in batches]

print("Waiting for all 4 batches to finish...")
while True:
    done = 0
    for log in logs:
        if os.path.exists(log):
            with open(log, "r") as f:
                if "v30 done" in f.read():
                    done += 1
    if done == len(batches):
        break
    time.sleep(10)

print("All batches finished!")
