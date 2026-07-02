import os
import sqlite3

db_path = '/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/data/audit_runs.db'
if os.path.exists(db_path):
    print(f"DB exists, size: {os.path.getsize(db_path) / 1024 / 1024:.2f} MB")
else:
    print("DB does not exist.")
