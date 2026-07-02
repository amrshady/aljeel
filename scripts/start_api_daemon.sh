#!/bin/bash
/usr/bin/nohup /usr/bin/python3 /home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py > /home/clawdbot/.openclaw/workspace/aljeel/droplet_api.log 2>&1 &
sleep 2
/usr/bin/nohup /home/clawdbot/.openclaw/workspace/aljeel/scripts/run_tunnel.sh > /home/clawdbot/.openclaw/workspace/aljeel/tunnel.log 2>&1 &
