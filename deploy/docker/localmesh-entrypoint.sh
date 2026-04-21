#!/bin/sh
set -e

# Initialise the local CA so mkcert can sign certs for internal domains.
export CAROOT="${LOCALMESH_CA_DIR:-/ca}"
mkdir -p "$CAROOT" "${LOCALMESH_CERTS_DIR:-/certs}"

if [ ! -f "$CAROOT/rootCA.pem" ]; then
  echo "[localmesh] Initialising local CA with mkcert..."
  mkcert -install
fi

exec node /app/apps/api/dist/server.js
