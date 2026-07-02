import sqlite3
import json
import glob
import re
import argparse
from datetime import datetime

TICKET_RE = re.compile(r'(?<!\d)(\d{10}|26-\d{3,4})(?!\d)')
db_path = '/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/data/audit_runs.db'

parser = argparse.ArgumentParser(description="Seed LLM audit records into the portal DB")
parser.add_argument("--batch", help="Batch id to refresh, e.g. J26-788")
args = parser.parse_args()

conn = sqlite3.connect(db_path)
c = conn.cursor()

c.execute('''
    CREATE TABLE IF NOT EXISTS audit_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        batch_id TEXT,
        pipeline_version TEXT,
        ticket_no TEXT,
        passenger TEXT,
        description TEXT,
        method TEXT,
        llm_model TEXT,
        llm_in_tokens INTEGER,
        llm_out_tokens INTEGER,
        llm_reasoning TEXT,
        call1_json TEXT,
        call2_json TEXT,
        final_json TEXT
    )
''')
conn.commit()

batch_filter = args.batch
if batch_filter:
    batch_filter = batch_filter.replace('jawal-', '')
    c.execute("DELETE FROM audit_runs WHERE batch_id = ?", (batch_filter,))
    conn.commit()
    trace_files = glob.glob(f'/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-{batch_filter}/output/step-trace-*.jsonl')
else:
    trace_files = glob.glob('/home/clawdbot/.openclaw/workspace/aljeel/batches/*/output/step-trace-*.jsonl')

inserted = 0
for trace_file in trace_files:
    batch_id = trace_file.split('/')[-3].replace('jawal-', '')
    pipeline_version = trace_file.split('/')[-1].replace('step-trace-', '').replace('.jsonl', '')
    
    with open(trace_file, 'r') as f:
        for line in f:
            if not line.strip(): continue
            try:
                data = json.loads(line)
                desc = data.get("description", "")
                m = TICKET_RE.search(desc)
                ticket_no = m.group(1) if m else "UNKNOWN"
                
                passenger = desc.split(' - ')[0] if ' - ' in desc else desc
                method = data.get("route_reason", "cascade")
                
                call1 = data.get("call1") or {}
                call2 = data.get("call2") or {}
                final = data.get("final") or {}
                
                model = call2.get("model", call1.get("model", ""))
                in_tokens = (call1.get("in_tokens") or 0) + (call2.get("in_tokens") or 0)
                out_tokens = (call1.get("out_tokens") or 0) + (call2.get("out_tokens") or 0)
                reasoning = final.get("reasoning", "")
                
                c.execute('''
                    INSERT INTO audit_runs 
                    (timestamp, batch_id, pipeline_version, ticket_no, passenger, description, method, llm_model, llm_in_tokens, llm_out_tokens, llm_reasoning, call1_json, call2_json, final_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    datetime.utcnow().isoformat() + "Z",
                    batch_id,
                    pipeline_version,
                    ticket_no,
                    passenger,
                    desc,
                    method,
                    model,
                    in_tokens,
                    out_tokens,
                    reasoning,
                    json.dumps(call1),
                    json.dumps(call2),
                    json.dumps(final)
                ))
                inserted += 1
            except Exception as e:
                print(f"Error parsing line: {e}")

conn.commit()
print(f"Successfully inserted {inserted} LLM audit records into DB.")
