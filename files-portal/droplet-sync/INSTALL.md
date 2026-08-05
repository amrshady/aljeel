# AlJeel AP KB sync guardrail deployment

This is a human-run, root-owned deployment. It does not require broader sudo access, secrets changes, SSH automation, cron edits, or a live sync during installation. The canonical KB volume is `/mnt/aljeel-ap_kb`.

## Pre-deployment gates

From the repository root, run the syntax, test, unit-verification, and logrotate gates documented in `IMPLEMENTATION.md`. Stop if any gate fails. Confirm `/mnt/aljeel-ap_kb` is a mounted filesystem with at least 8 GiB free and that `/etc/kb-sync.env` still sets `VOLUME=/mnt/aljeel-ap_kb`.

## Backup and install order

Use a root-only backup directory and preserve metadata. Replace `<source>` with the absolute path to this repository's `source` directory.

1. Stop only the two timers while files are replaced:

   ```sh
   sudo systemctl stop kb-sync.timer kb-sync-watchdog.timer
   ```

2. Back up every existing target that is present:

   ```sh
   backup=/root/kb-sync-guardrail-backup
   sudo install -d -m 0700 "$backup"
   sudo cp -a /usr/local/bin/kb-sync.sh /etc/systemd/system/kb-sync.service "$backup"/
   sudo cp -a /usr/local/bin/kb-sync-watchdog.sh /etc/systemd/system/kb-sync-watchdog.service /etc/systemd/system/kb-sync-watchdog.timer /etc/logrotate.d/kb-sync "$backup"/ 2>/dev/null || true
   ```

3. Install scripts first, then units, then logrotate configuration:

   ```sh
   sudo install -o root -g root -m 0755 <source>/kb-sync.sh /usr/local/bin/kb-sync.sh
   sudo install -o root -g root -m 0755 <source>/kb-sync-watchdog.sh /usr/local/bin/kb-sync-watchdog.sh
   sudo install -o root -g root -m 0644 <source>/kb-sync.service /etc/systemd/system/kb-sync.service
   sudo install -o root -g root -m 0644 <source>/kb-sync-watchdog.service /etc/systemd/system/kb-sync-watchdog.service
   sudo install -o root -g root -m 0644 <source>/kb-sync-watchdog.timer /etc/systemd/system/kb-sync-watchdog.timer
   sudo install -o root -g root -m 0644 <source>/kb-sync.logrotate /etc/logrotate.d/kb-sync
   ```

4. Verify installed ownership/modes, reload systemd, and validate the installed units/config:

   ```sh
   sudo systemctl daemon-reload
   sudo systemd-analyze verify /etc/systemd/system/kb-sync.service /etc/systemd/system/kb-sync-watchdog.service /etc/systemd/system/kb-sync-watchdog.timer
   sudo logrotate --debug /etc/logrotate.d/kb-sync
   systemctl cat kb-sync.service kb-sync-watchdog.service kb-sync-watchdog.timer
   ```

5. Run the local kill switch in dry-run mode. A host with no metrics history is healthy; any existing hazard is reported without creating a sentinel or calling systemctl:

   ```sh
   sudo DRY_RUN=1 /usr/local/bin/kb-sync-watchdog.sh
   ```

6. Enable the watchdog first, then the sync timer. This ordering ensures the independent kill switch is active before sync resumes:

   ```sh
   sudo systemctl enable --now kb-sync-watchdog.timer
   sudo systemctl enable --now kb-sync.timer
   systemctl status kb-sync-watchdog.timer kb-sync.timer --no-pager
   systemctl list-timers kb-sync-watchdog.timer kb-sync.timer --no-pager
   ```

7. After one completed sync, verify exactly one new tab-separated record (`epoch`, RX-byte delta, `success` or `failure`) and re-run the dry-run watchdog:

   ```sh
   sudo tail -n 3 /var/lib/kb-sync-watchdog/metrics.tsv
   sudo DRY_RUN=1 /usr/local/bin/kb-sync-watchdog.sh
   ```

Do not print `/etc/kb-sync.env`; it may contain secrets.

## Trip investigation and sentinel reset

`TRIPPED` is persistent and `ConditionPathExists` prevents `kb-sync.service` from starting across reboot. Before resetting it, identify and correct the cause: excessive recent RX telemetry, disk at least 80% used, less than 8 GiB free, an `archive/*/asateel` directory, or excessive newly archived Jawal data. Preserve `metrics.tsv` for incident evidence.

Only after the cause is resolved:

```sh
sudo systemctl stop kb-sync.timer
sudo rm -- /var/lib/kb-sync-watchdog/TRIPPED
sudo DRY_RUN=1 /usr/local/bin/kb-sync-watchdog.sh
sudo systemctl enable --now kb-sync-watchdog.timer
sudo systemctl enable --now kb-sync.timer
```

Removing the sentinel is the only reset action. Do not delete or truncate `metrics.tsv`.

## Rollback

Stop both timers, restore the backed-up files with `sudo cp -a`, run `sudo systemctl daemon-reload`, verify the restored units, and enable only the timers that were enabled before deployment. If the new guardrail tripped for a real hazard, do not remove `TRIPPED` or restart sync merely to complete rollback; resolve the hazard first. The telemetry file is append-only operational evidence and can remain in place.
