#!/bin/bash
# Stable Cloudflare Tunnel for aljeel-ap droplet API
# Route: https://aljeel-ap.accordpartners.ai -> localhost:5000
# Tunnel ID: c281300c-ce87-41ac-a551-ccfddba5941f
# Replaces localhost.run (was dropping randomly, changing URL on reconnect)

CLOUDFLARED="/home/clawdbot/.local/bin/cloudflared"
TOKEN="eyJhIjoiNTE1NzQyNWJiYWJiMzMyNDk1OTU0ZTE4YjE0MTU5NTAiLCJ0IjoiYzI4MTMwMGMtY2U4Ny00MWFjLWE1NTEtY2NmZGRiYTU5NDFmIiwicyI6IjI5aGM2bFVGWjZlL1V1bStNeE9sM2VHK2dwSTFadkZWSXc3Q1JUTHh4U2NPdmdDUC9EQ0YxeUx2cmVleU5aT0lTZnZLWnNMdlliKzd4bTlNbWVnWFB3PT0ifQ=="
LOG="/home/clawdbot/.openclaw/workspace/aljeel/cloudflared.log"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting cloudflared tunnel (aljeel-ap.accordpartners.ai)..." >> "$LOG"

while true; do
    "$CLOUDFLARED" tunnel --no-autoupdate run --token "$TOKEN" >> "$LOG" 2>&1
    EXIT=$?
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] cloudflared exited (code=$EXIT), restarting in 5s..." >> "$LOG"
    sleep 5
done
