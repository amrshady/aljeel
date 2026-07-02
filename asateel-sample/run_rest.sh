#!/bin/bash
set -u
D="/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample"
S="$D/ocr_one.sh"
JOBS=(
"ADMIN|اداره 8-2026|03063"
"ADMIN|اداره 8-2026|03064"
"ADMIN|اداره 8-2026|03065"
"ADMIN|اداره 8-2026|03066"
"ADMIN|اداره 8-2026|03088"
"CENTRAL|وسطي 11-2026|03041"
"CENTRAL|وسطي 11-2026|03042"
"CENTRAL|وسطي 11-2026|03043"
"CENTRAL|وسطي 11-2026|03044"
"CENTRAL|وسطي 11-2026|03045"
)
for j in "${JOBS[@]}"; do
  IFS='|' read -r tag folder inv <<< "$j"
  bash "$S" "$tag" "$folder" "$inv" &
  while [ "$(jobs -r | wc -l)" -ge 4 ]; do sleep 1; done
done
wait
echo "REST_OCR_DONE"
