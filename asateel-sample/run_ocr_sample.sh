#!/bin/bash
# OCR sampler: 5 invoices from each of the 3 Asateel folders.
set -u
BASE="/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_pdfs"
OUT="/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_ocr_sample"
TMP="/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_ocr_tmp"
mkdir -p "$OUT" "$TMP"

declare -A FOLDERS=(
  ["PROJECTS"]="مشاريع 13-2026"
  ["ADMIN"]="اداره 8-2026"
  ["CENTRAL"]="وسطي 11-2026"
)
declare -A PICKS=(
  ["PROJECTS"]="03048 03049 03050 03051 03052"
  ["ADMIN"]="03063 03064 03065 03066 03088"
  ["CENTRAL"]="03041 03042 03043 03044 03045"
)

for tag in PROJECTS ADMIN CENTRAL; do
  fdir="$BASE/${FOLDERS[$tag]}"
  for inv in ${PICKS[$tag]}; do
    pdf="$fdir/${inv}_0001.pdf"
    out="$OUT/${tag}__${inv}.txt"
    echo "===== $tag / ${inv} =====" > "$out"
    if [ ! -f "$pdf" ]; then echo "[MISSING PDF]" >> "$out"; continue; fi
    np=$(pdfinfo "$pdf" 2>/dev/null | awk '/^Pages:/{print $2}')
    echo "(pages: $np)" >> "$out"
    rm -f "$TMP"/pg-*.png
    pdftoppm -r 300 -png "$pdf" "$TMP/pg" >/dev/null 2>&1
    for png in "$TMP"/pg-*.png; do
      [ -f "$png" ] || continue
      echo "----- $(basename $png) -----" >> "$out"
      tesseract "$png" stdout -l ara+eng 2>/dev/null >> "$out"
      echo "" >> "$out"
    done
    echo "DONE $tag/$inv"
  done
done
echo "ALL_OCR_DONE"
