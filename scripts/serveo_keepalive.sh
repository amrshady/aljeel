#!/bin/bash
while true; do
    echo "Starting Serveo..."
    ssh -o ServerAliveInterval=60 -o StrictHostKeyChecking=no -R 80:localhost:5000 serveo.net > /home/clawdbot/.openclaw/workspace/aljeel/serveo.log 2>&1
    echo "Serveo crashed. Restarting in 5 seconds..."
    sleep 5
done
