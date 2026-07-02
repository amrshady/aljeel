#!/bin/bash
while true; do
    echo "Starting cloudflared..."
    /home/clawdbot/.openclaw/workspace/cloudflared-linux-amd64 tunnel --url http://localhost:5000 > /home/clawdbot/.openclaw/workspace/aljeel/cloudflared.log 2>&1
    echo "Cloudflared crashed. Restarting in 5 seconds..."
    sleep 5
done
