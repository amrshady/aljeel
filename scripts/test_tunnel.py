import requests
import os

try:
    print("Fetching KV...")
    KV_ACCOUNT_ID = "5157425bbabb332495954e18b1415950"
    KV_NAMESPACE_ID = "347321c22fde42d6812d942e92589809"
    API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN")

    res = requests.get(
        f"https://api.cloudflare.com/client/v4/accounts/{KV_ACCOUNT_ID}/storage/kv/namespaces/{KV_NAMESPACE_ID}/values/DROPLET_URL",
        headers={"Authorization": f"Bearer {API_TOKEN}"}
    )
    url = res.text.strip()
    print(f"Tunnel URL is: {url}")
    
    print("Testing ping...")
    ping_res = requests.get(f"{url}/ping")
    print(f"Ping returned: {ping_res.status_code} {ping_res.text}")
except Exception as e:
    print(e)
