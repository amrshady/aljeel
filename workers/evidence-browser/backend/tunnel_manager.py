import subprocess
import re
import time
import requests
import os

KV_ACCOUNT_ID = "5157425bbabb332495954e18b1415950"
KV_NAMESPACE_ID = "347321c22fde42d6812d942e92589809"
API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN")

def update_kv(url):
    print(f"Updating KV with URL: {url}")
    try:
        res = requests.put(
            f"https://api.cloudflare.com/client/v4/accounts/{KV_ACCOUNT_ID}/storage/kv/namespaces/{KV_NAMESPACE_ID}/values/DROPLET_URL",
            headers={"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "text/plain"},
            data=url
        )
        print(res.status_code, res.text)
    except Exception as e:
        print(f"Failed to update KV: {e}")

def main():
    while True:
        try:
            print("Starting localhost.run tunnel...")
            proc = subprocess.Popen(
                ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3", "-R", "80:localhost:5000", "nokey@localhost.run"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            for line in iter(proc.stdout.readline, ''):
                print(line.strip())
                m = re.search(r'https://[a-zA-Z0-9.-]+\.lhr\.life', line)
                if m:
                    url = m.group(0)
                    update_kv(url)
            proc.wait()
        except Exception as e:
            print(f"Error in tunnel main loop: {e}")
        print("Tunnel crashed. Restarting in 5 seconds...")
        time.sleep(5)

if __name__ == "__main__":
    main()
