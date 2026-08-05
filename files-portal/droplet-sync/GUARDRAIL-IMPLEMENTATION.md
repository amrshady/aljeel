# AlJeel AP KB sync runtime guardrails

## Architecture

`kb-sync.sh` preserves the existing namespace/removal correction, one rclone retry, 8 GiB preflight, and combined Jawal plus Asateel remote listing. Immediately before the two Spaces copy phases it reads the default interface RX counter. On success or failure it reads the counter again and appends exactly one serialized record to `/var/lib/kb-sync-watchdog/metrics.tsv`:

```text
end_epoch<TAB>received_byte_delta<TAB>success|failure
```

The approximation is intentionally conservative and independent of rclone's human output. It may include unrelated inbound traffic during the copy window, but cannot miss bytes merely because rclone changed or omitted a stats line. Counter rollback is recorded as zero. Telemetry creation is root-owned (`0750` directory, `0640` file), locked with `flock`, append-only, contains no object names or secrets, and failure to prepare/read/write required telemetry stops the sync safely.

`kb-sync-watchdog.sh` is an independent local kill switch. It reads distinct valid metric records ending in the last 900 seconds and trips on either:

- one observation of at least 6 GiB (`6,442,450,944` bytes); or
- at least 10 GiB (`10,737,418,240` bytes) total in 15 minutes.

This keeps one normal 4.58 GiB bootstrap healthy, keeps two such runs below the rolling ceiling, and catches the third repeat. Repeated small legitimate uploads remain far below the byte ceiling. Both successful and failed copy observations count because failed downloads still consume ingress and may repeat.

The watchdog also trips when:

- the canonical `/mnt/aljeel-ap_kb` filesystem is at least 80% used;
- free space is below 8 GiB;
- any `archive/*/asateel` directory exists;
- at least 100 non-Asateel archive files appeared in 15 minutes;
- at least 1 GiB of non-Asateel archive data appeared in 15 minutes;
- an existing non-empty telemetry file is unreadable or contains a malformed record; or
- the persistent sentinel already exists.

Archive count/byte checks use modification time and therefore ignore historical Jawal archive content. The Asateel directory check is intentionally historical because any duplicate Asateel archive is evidence of the namespace regression.

On a real trip, the watchdog atomically creates `/var/lib/kb-sync-watchdog/TRIPPED` and runs `systemctl disable --now kb-sync.timer`. An existing sentinel is preserved and repeated runs do not repeat the systemctl mutation. `DRY_RUN=1` reports both intended actions but creates no file and never calls systemctl. `kb-sync.service` also has `ConditionPathExists=!/var/lib/kb-sync-watchdog/TRIPPED`, so the stop remains effective after reboot or a manual service start attempt.

## Systemd and rotation

The sync remains a root `Type=oneshot` service with its existing environment file and executable. `TimeoutStartSec=600` is the effective runtime limit; `RuntimeMaxSec` and the unmeasured `MemoryMax` were removed. `Nice=10` and `IOWeight=25` remain. The watchdog uses `StateDirectory=kb-sync-watchdog`, the canonical mount, and a oneshot timer cadence. Logrotate retains root ownership after installation.

## Deployment gates

Run from the repository root:

```sh
bash -n source/kb-sync.sh source/kb-sync-watchdog.sh source/test-kb-sync.sh source/test-kb-sync-watchdog.sh
shellcheck source/kb-sync.sh source/kb-sync-watchdog.sh source/test-kb-sync.sh source/test-kb-sync-watchdog.sh
bash source/test-kb-sync.sh
bash source/test-kb-sync-watchdog.sh
```

For systemd verification, create an isolated temporary root containing staged copies of the three units, both executables, and `/etc/kb-sync.env`, then run `systemd-analyze verify --recursive-errors=no --root=<temporary-root> ...`. Disabling recursive dependency errors keeps the isolated root independent of the host's base units while still validating the requested unit files and staged `ExecStart` paths. Run `logrotate --debug source/kb-sync.logrotate` where available; if the local build rejects a repository-owned config solely because it is not root-owned, copy it into a root-owned temporary directory and repeat there.

Finally inspect `git diff --check` and a diff scoped to the ten authorized paths. Deployment remains a separate human approval gate; this repository job does not deploy, SSH, edit cron, or touch secrets.

## Rollback and recovery

Back up targets before replacement and follow `source/INSTALL.md` in order. Rollback restores the saved scripts, units, and logrotate file, reloads systemd, and restores the prior timer enablement state. Do not erase telemetry. A tripped sentinel is reset only after the underlying disk, archive, or transfer cause is resolved and a dry-run watchdog check is healthy.

## Verification evidence

Local verification on 2026-08-01 produced:

- `bash -n`: passed for both runtime scripts and both test scripts.
- `source/test-kb-sync.sh`: `PASS: 3 kb-sync tests`.
- `source/test-kb-sync-watchdog.sh`: `PASS: 16 watchdog tests`.
- isolated-root `systemd-analyze verify --recursive-errors=no`: exit 0 with staged `ExecStart` files present.
- forbidden runtime regression scan: passed with no underscore mount alias, log-transfer parser, consecutive-positive rule, `RuntimeMaxSec`, or `MemoryMax` in runtime files.
- preservation scan: found the 8 GiB preflight, `--retries 1` on both copy phases, and combined Asateel namespace listing.
- scoped whitespace/diff and status inspection: passed; all ten deliverables are currently untracked within this otherwise dirty shared monorepo.
- `shellcheck`: unavailable on the local host.
- `logrotate`: unavailable on the local host, so config parsing must run at the deployment gate described above.

The tests cover healthy no-history behavior, the exact 4.58 GiB repeat pattern, large single runs, repeated tiny transfers, disk and archive hazards, historical archive safety, malformed telemetry, persistent/deduplicated sentinel behavior, dry-run isolation, successful and failed copy telemetry without network, and the existing namespace/removal regressions.

## Production deployment: 2026-08-01

- Root backup: `/root/kb-sync-guardrail-backup-20260801-145256` on the AlJeel AP host.
- Installed root-owned runtime files: `/usr/local/bin/kb-sync.sh`, `/usr/local/bin/kb-sync-watchdog.sh`, the sync/watchdog systemd units and timers, and `/etc/logrotate.d/kb-sync`.
- The deployment-host logrotate gate initially exposed `/var/log` group-write protection; adding `su root root` fixed the config and the installed `logrotate --debug` gate passed.
- Installed systemd units passed `systemd-analyze verify`; the sync service now has `TimeoutStartSec=600`, no ignored `RuntimeMaxSec`, no unmeasured memory cap, and the persistent sentinel condition.
- Manual production sync completed successfully and wrote one telemetry record: 2,029,240 received bytes, status `success`. Watchdog dry-run was healthy.
- The first automatic production cycle completed successfully and wrote a second telemetry record: 2,403,322 received bytes, status `success`.
- Production watchdog evaluated both records at 4,432,562 rolling bytes, well below the 10 GiB trip threshold.
- Final live state: sync and watchdog timers enabled/active; both services `Result=success`; Jawal 1,803 files; Asateel 302 files; zero Asateel archive directories; volume 15% used with 41 GiB free; no `TRIPPED` sentinel.
- Both AP source trees were reconciled byte-for-byte with the installed runtime files. Malik's independent five-minute monitor remains active as the external alerting layer.
