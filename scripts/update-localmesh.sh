#!/usr/bin/env bash
set -euo pipefail

# This script runs inside the localmesh Docker container.
# /opt/localmesh is bind-mounted from the host so git pull works.
# The Docker socket is mounted so docker compose can rebuild the service.

compose_file="${LOCALMESH_COMPOSE_FILE:-/opt/localmesh/docker/docker-compose.yml}"
install_root="${LOCALMESH_INSTALL_ROOT:-/opt/localmesh}"

echo "Pulling latest code..."
git -C "$install_root" pull --ff-only

echo "Rebuilding LocalMesh container..."
docker compose -f "$compose_file" build localmesh

echo "Restarting LocalMesh container..."
docker compose -f "$compose_file" up -d --no-deps localmesh

echo "Update complete."
