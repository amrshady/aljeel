Fixed immediate connectivity.

Results:
- Passwordless sudo: **no** (`sudo: a password is required`)
- Systemd service: **installed and enabled as user service**
  - File: `/home/clawdbot/.config/systemd/user/aljeel-tunnel.service`
  - `UnitFileState=enabled`
- Direct recovery process: **running**
  - `tunnel_manager.py` PID: `416513`
  - Child SSH tunnel PID: `416514`
- New KV URL: `https://d02b949648290a.lhr.life`
- Verification: **passing**
  - `curl https://d02b949648290a.lhr.life/ping`
  - Returned `HTTP/1.1 200 OK`
  - Body: `{"status":"ok"}`

Diff created:

```ini
# /home/clawdbot/.config/systemd/user/aljeel-tunnel.service
[Unit]
Description=Aljeel localhost.run tunnel manager
After=network-online.target aljeel-flask.service

[Service]
Type=simple
WorkingDirectory=/home/clawdbot/.openclaw/workspace/aljeel
EnvironmentFile=/home/clawdbot/.openclaw/.env
ExecStart=/usr/bin/python3 /home/clawdbot/.openclaw/workspace/aljeel/scripts/tunnel_manager.py
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

Commands run:
```bash
/usr/bin/sudo -n true
/usr/bin/nohup /usr/bin/python3 /home/clawdbot/.openclaw/workspace/aljeel/scripts/tunnel_manager.py > /tmp/tunnel-now.log 2>&1 &
/usr/bin/mkdir -p /home/clawdbot/.config/systemd/user
XDG_RUNTIME_DIR=/run/user/$(/usr/bin/id -u) /usr/bin/systemctl --user daemon-reload
XDG_RUNTIME_DIR=/run/user/$(/usr/bin/id -u) /usr/bin/systemctl --user enable aljeel-tunnel.service
/usr/bin/curl -i --max-time 15 https://d02b949648290a.lhr.life/ping
```

For Amr to install this as the requested system service instead:

```bash
sudo /usr/bin/tee /etc/systemd/system/aljeel-tunnel.service >/dev/null <<'EOF'
[Unit]
Description=Aljeel localhost.run tunnel manager
After=network-online.target aljeel-flask.service

[Service]
Type=simple
WorkingDirectory=/home/clawdbot/.openclaw/workspace/aljeel
EnvironmentFile=/home/clawdbot/.openclaw/.env
ExecStart=/usr/bin/python3 /home/clawdbot/.openclaw/workspace/aljeel/scripts/tunnel_manager.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo /usr/bin/systemctl daemon-reload
sudo /usr/bin/systemctl enable aljeel-tunnel.service
sudo /usr/bin/systemctl start aljeel-tunnel.service
sudo /usr/bin/systemctl status aljeel-tunnel.service --no-pager
```

I did not touch `cloudflared.service` and did not modify `scripts/tunnel_manager.py`.
