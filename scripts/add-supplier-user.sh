#!/usr/bin/env bash
# add-supplier-user.sh — add a supplier login to the AP vendor platform DB.
# Usage:  add-supplier-user.sh <email> <supplierId> [full name] [role]
#   supplierId : supplier_asateel | supplier_jawal | supplier_a | supplier_b
#   role       : SUPPLIER_USER (default) | SUPPLIER_ADMIN
# Examples:
#   add-supplier-user.sh taha@asatilealttariq.com supplier_asateel "Taha"
#   add-supplier-user.sh boss@vendor.com supplier_jawal "Boss" SUPPLIER_ADMIN
#
# NOTE: This is only HALF the job. The portal is behind Cloudflare Access.
# You MUST also add the email to the CF Access policy for ap-aljeel.accordpartners.ai
# (Cloudflare dashboard) or the OTP will never be sent and they cannot log in.
set -euo pipefail

EMAIL_RAW="${1:?email required}"
SUPPLIER="${2:?supplierId required (e.g. supplier_asateel)}"
FULLNAME="${3:-}"
ROLE="${4:-SUPPLIER_USER}"

# auth layer lowercases the CF email before lookup — store lowercase or login fails
EMAIL="$(printf '%s' "$EMAIL_RAW" | tr '[:upper:]' '[:lower:]')"
[ -z "$FULLNAME" ] && FULLNAME="${EMAIL%%@*}"

export LD_LIBRARY_PATH=/home/clawdbot/pglocal/root/usr/lib/x86_64-linux-gnu
export PGPASSWORD=aljeel
PSQL="/home/clawdbot/pglocal/root/usr/lib/postgresql/16/bin/psql -U aljeel -h localhost -d aljeel -t -A"

# guard: supplier must exist
if [ "$($PSQL -c "SELECT count(*) FROM \"Supplier\" WHERE id='$SUPPLIER';")" != "1" ]; then
  echo "ERROR: supplier '$SUPPLIER' not found. Valid: $($PSQL -c "SELECT string_agg(id,', ') FROM \"Supplier\";")"
  exit 1
fi

NID="csup$(openssl rand -hex 10)"
$PSQL -c "INSERT INTO \"SupplierUser\" (id,\"supplierId\",email,\"fullName\",role,\"mfaEnabled\",\"isActive\",\"createdAt\")
 VALUES ('$NID','$SUPPLIER','$EMAIL','$FULLNAME','$ROLE',false,true,now())
 ON CONFLICT (email) DO UPDATE SET \"supplierId\"=EXCLUDED.\"supplierId\", \"isActive\"=true, role=EXCLUDED.role
 RETURNING email,role,\"supplierId\",\"isActive\";"

echo "DB done for $EMAIL -> $SUPPLIER ($ROLE)."
echo "NEXT: add $EMAIL to Cloudflare Access policy for ap-aljeel.accordpartners.ai or they cannot log in."
