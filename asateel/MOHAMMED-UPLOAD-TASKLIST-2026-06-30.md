# Aljeel Asateel — Task List (Mohammed Labadi upload, 2026-06-30)

Source: Asateel tab → `spaces:accord-aljeel-ap-kb/asateel/current/`
Landed on droplet: `/mnt/aljeel_ap_kb/current/asateel/`
Total: 6 batch folders, 308 files (296 ride-invoice PDFs + statement/master xlsx)

| # | Task (batch) | Arabic folder | Files | Statement file(s) |
|---|---|---|---|---|
| 1 | Administration 10-2026 — allocate & reconcile | اداره 10 | 23 | كشف ادارة رقم 10-2026.xlsx |
| 2 | Projects 15-2026 — allocate & reconcile | مشاريع 15 | 84 | كشف المشاريع رقم 15-2026.xlsx |
| 3 | Projects 16-2026 — allocate & reconcile | مشاريع 16 | 53 | P&T 16-2026.xlsx + كشف مشاريع 16-26.xlsx |
| 4 | Central (Wasati) 13-2026 — allocate & reconcile | وسطي 13 | 66 | Central 13-2026.xlsx + كشف وسطي 13-2026.xlsx |
| 5 | Central (Wasati) 14-2026 — allocate & reconcile | وسطي 14 | 49 | Central 14-2026.xlsx + كشف وسطي 14-2026.xlsx |
| 6 | Central (Wasati) 15-2026 — allocate & reconcile | وسطي 15 | 38 | Central 15-2026.xlsx + كشف وسطي 15-2026.xlsx |

Each task = one Asateel allocation/reconciliation run: OCR ride-invoice PDFs → resolve route→customer→division→CC+agency via Central master + Wasati shipping log → build Oracle GL coding sheet → flag exceptions.

## Infra note (fixed during scan)
Asateel uploads had been failing to sync for hours: `/mnt/aljeel_ap_kb/current/asateel/` was root-owned, so rclone (runs as clawdbot) hit `mkdir ... permission denied` every 60s. Recreated the dir as clawdbot-owned; all 308 files now synced. Permanent fix should land in kb-sync provisioning so it survives re-creation.
