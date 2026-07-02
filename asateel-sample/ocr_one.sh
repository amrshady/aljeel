#!/bin/bash
# OCR a single invoice: args = TAG FOLDER INV
set -u
tag="$1"; folder="$2"; inv="$3"
BASE="/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_pdfs"
OUT="/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_ocr_sample"
TMP="/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_ocr_tmp/$tag-$inv"
mkdir -p "$OUT" "$TMP"
pdf="$BASE/$folder/${inv}_0001.pdf"
out="$OUT/${tag}__${inv}.txt"
echo "===== $tag / ${inv} =====" > "$out"
if [ ! -f "$pdf" ]; then echo "[MISSING PDF]" >> "$out"; exit 0; fi
np=$(pdfinfo "$pdf" 2>/dev/null | awk '/^Pages:/{print $2}')
echo "(pages: $np)" >> "$out"
pdftoppm -r 220 -png "$pdf" "$TMP/pg" >/dev/null 2>&1
for png in "$TMP"/pg-*.png; do
  [ -f "$png" ] || continue
  echo "----- $(basename $png) -----" >> "$out"
  tesseract "$png" stdout -l ara+eng 2>/dev/null >> "$out"
  echo "" >> "$out"
done
rm -rf "$TMP"
echo "DONE $tag/$inv"
