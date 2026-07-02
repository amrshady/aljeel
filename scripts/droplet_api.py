import os
import subprocess
from flask import Flask, request, Response, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/ping', methods=['GET'])
def ping():
    return jsonify({"status": "ok"})

@app.route('/process', methods=['GET'])
def process_batch():
    batch_id = request.args.get('batch_id', 'J26-550')
    no_cache = request.args.get('no_cache', 'false').lower() == 'true'
    
    def generate():
        yield f"data: [API] Starting pipeline for {batch_id} (Cache {'Disabled' if no_cache else 'Enabled'})...\n\n"
        
        # 1. Run the Python pipeline
        cmd = ["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py", batch_id, "--input-suffix", "v15.11.2"]
        
        if no_cache:
            cmd.append("--no-cache")
            
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in iter(proc.stdout.readline, ''):
            yield f"data: {line.strip()}\n\n"
        proc.wait()
        
        if proc.returncode != 0:
            yield f"data: [API] Pipeline failed with code {proc.returncode}\n\n"
            yield "data: [END]\n\n"
            return
            
        yield "data: [API] Pipeline finished! Updating Audit DB...\n\n"
        
        # 2. Seed DB
        subprocess.run(["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/seed_audit_db.py"])
        
        # 3. Export JSON
        subprocess.run(["python3", "/home/clawdbot/.openclaw/workspace/aljeel/scripts/export_audit_json.py"])
        
        yield "data: [API] Deploying updated data to Cloudflare...\n\n"
        
        # 4. Deploy Wrangler
        deploy = subprocess.Popen(
            ["npx", "wrangler", "pages", "deploy", "public/"],
            cwd="/home/clawdbot/.openclaw/workspace/aljeel/dashboard",
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
        )
        for line in iter(deploy.stdout.readline, ''):
            yield f"data: {line.strip()}\n\n"
        deploy.wait()
        
        yield "data: [API] Deploy complete! Refreshing UI in 3 seconds...\n\n"
        yield "data: [END]\n\n"
        
    return Response(generate(), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
