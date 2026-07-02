import requests

url = "http://localhost:5000/process?batch_id=J26-550&no_cache=true"
print(f"Triggering {url} ...")
with requests.get(url, stream=True) as r:
    for line in r.iter_lines():
        if line:
            print(line.decode('utf-8'))
