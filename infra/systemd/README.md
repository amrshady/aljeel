# Aljeel AP Platform — systemd units

These two unit files make the Aljeel AP vendor platform survive reboots by running
the API and Web tiers under systemd instead of `nohup`.

| Unit                | Tier | Command                                                        | Port | Health check                          |
| ------------------- | ---- | -------------------------------------------------------------- | ---- | ------------------------------------- |
| `aljeel-api.service`| API  | `/usr/bin/node dist/src/main.js` (NestJS, from `apps/api`)     | 3002 | http://localhost:3002/api/v1/health   |
| `aljeel-web.service`| Web  | `pnpm --filter @aljeel/web start` (Next.js)                    | 3000 | http://localhost:3000/en/login        |

Both run as `clawdbot:clawdbot`. The API loads its secrets from `apps/api/.env`
(dotenv) — the unit only sets `NODE_ENV=production` and `PORT=3002`. The Web unit
starts only **after** the API unit. Verified absolute paths on this host:
`node` → `/usr/bin/node`, `pnpm` → `/home/clawdbot/.local/bin/pnpm`.

---

## 1. Stop the current nohup-launched processes first

Free ports 3000 and 3002 before enabling the services, otherwise the units will
crash-loop on "address already in use". Kill the existing background processes by
their exact command patterns:

```bash
# API: node dist/src/main.js
pkill -f 'node dist/src/main.js'

# Web: the pnpm/next start for @aljeel/web
pkill -f '@aljeel/web start'
pkill -f 'next start'

# Confirm the ports are now free (should print nothing):
ss -ltnp 'sport = :3002' 'sport = :3000'
```

## 2. Install the unit files

```bash
sudo cp /home/clawdbot/.openclaw/workspace/aljeel-repo/infra/systemd/aljeel-api.service /etc/systemd/system/
sudo cp /home/clawdbot/.openclaw/workspace/aljeel-repo/infra/systemd/aljeel-web.service /etc/systemd/system/
sudo systemctl daemon-reload
```

## 3. Enable + start both (enable = start on boot, --now = start immediately)

```bash
sudo systemctl enable --now aljeel-api.service
sudo systemctl enable --now aljeel-web.service
```

## 4. Check status

```bash
systemctl status aljeel-api.service
systemctl status aljeel-web.service
```

## 5. Tail logs

```bash
# Follow live logs
journalctl -u aljeel-api.service -f
journalctl -u aljeel-web.service -f

# Last 100 lines since the most recent boot
journalctl -u aljeel-api.service -b -n 100
journalctl -u aljeel-web.service -b -n 100
```

## 6. Verify the health endpoints

```bash
curl -fsS http://localhost:3002/api/v1/health && echo   # API
curl -fsS http://localhost:3000/en/login    -o /dev/null -w '%{http_code}\n'   # Web
```

---

## Common operations

```bash
# Restart after a deploy / config change
sudo systemctl restart aljeel-api.service aljeel-web.service

# Stop
sudo systemctl stop aljeel-web.service aljeel-api.service

# Disable auto-start on boot
sudo systemctl disable aljeel-api.service aljeel-web.service
```

> If you edit either `.service` file, re-copy it to `/etc/systemd/system/`, then run
> `sudo systemctl daemon-reload && sudo systemctl restart <unit>`.
