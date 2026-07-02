import sqlite3
import json
import argparse

db_path = '/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/data/audit_runs.db'
export_path = '/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/data/audit-export.json'

parser = argparse.ArgumentParser(description="Export portal audit records to JSON")
parser.add_argument("--batch", help="Batch id to export, e.g. J26-788")
args = parser.parse_args()

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
c = conn.cursor()

if args.batch:
    batch_id = args.batch.replace('jawal-', '')
    c.execute(
        "SELECT ticket_no, passenger, description, method, llm_model, llm_in_tokens, llm_out_tokens, llm_reasoning FROM audit_runs WHERE batch_id = ?",
        (batch_id,),
    )
else:
    c.execute("SELECT ticket_no, passenger, description, method, llm_model, llm_in_tokens, llm_out_tokens, llm_reasoning FROM audit_runs")
rows = c.fetchall()

data = [dict(row) for row in rows]

with open(export_path, 'w') as f:
    json.dump(data, f)

print(f"Exported {len(data)} records to static JSON blob for frontend querying.")
