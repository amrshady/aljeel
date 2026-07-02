#!/bin/bash
set -a
source /home/clawdbot/.openclaw/.env 2>/dev/null || true
set +a
/usr/bin/python3 /home/clawdbot/.openclaw/workspace/aljeel/scripts/tunnel_manager.py
