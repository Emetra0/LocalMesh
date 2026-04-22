#!/usr/bin/env bash
set -euo pipefail

compose_file="${LOCALMESH_COMPOSE_FILE:-/opt/localmesh/docker/docker-compose.yml}"
install_root="${LOCALMESH_INSTALL_ROOT:-/opt/localmesh}"

server_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '/src/{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1);exit}}' || hostname -I 2>/dev/null | awk '{print $1}' || echo '127.0.0.1')"

echo "Pulling latest code..."
git -C "$install_root" pull --ff-only

echo "Rebuilding LocalMesh container..."
docker compose -f "$compose_file" build localmesh

echo "Restarting LocalMesh container..."
docker compose -f "$compose_file" up -d --no-deps localmesh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  LocalMesh updated successfully"
echo "  Dashboard: http://${server_ip}:2690"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
