import re

filepath = "/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/_worker.js"
with open(filepath, "r") as f:
    content = f.read()

new_routes = """
    if (url.pathname === '/api/process') {
      try {
        const targetStr = await env.ACTIONS_KV.get('DROPLET_URL');
        if (!targetStr) return jsonResponse({ ok: false, error: 'DROPLET_URL not set in KV' }, 500);
        
        const targetUrl = new URL(targetStr);
        targetUrl.pathname = '/process';
        targetUrl.search = url.search;
        
        const response = await fetch(targetUrl.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream'
          }
        });
        
        return new Response(response.body, {
          status: response.status,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    if (url.pathname.startsWith('/files/')) {"""

content = content.replace("if (url.pathname.startsWith('/files/')) {", new_routes)

with open(filepath, "w") as f:
    f.write(content)
print("Worker patched")
