#!/usr/bin/env bash
set -euo pipefail

ca_dir="${LOCALMESH_CA_DIR:-/ca}"
mkdir -p "$ca_dir" /certs
export CAROOT="$ca_dir"

if [[ ! -f "$ca_dir/rootCA.pem" ]]; then
  mkcert -install
fi

while true; do
  sleep 3600
done
