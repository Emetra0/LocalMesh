#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${LOCALMESH_INSTALL_ROOT:-/opt/localmesh}"
node_major="${LOCALMESH_NODE_MAJOR:-22}"

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl git gnupg lsb-release rsync software-properties-common ufw tar

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${node_major}.x" | bash -
  apt-get install -y nodejs
fi

mkdir -p "$install_root"
rsync -a --delete --exclude '.git' "$repo_root/" "$install_root/"
mkdir -p "$install_root/ca" "$install_root/certs" "$install_root/data" "$install_root/docker"
cp "$install_root/deploy/docker/docker-compose.yml" "$install_root/docker/docker-compose.yml"
rsync -a --delete "$install_root/deploy/docker/mkcert/" "$install_root/docker/mkcert/"

if [[ ! -f "$install_root/.env.production" ]]; then
  admin_token="$(openssl rand -hex 24)"
  cat > "$install_root/.env.production" <<EOF
LOCALMESH_SERVER_IP=127.0.0.1
LOCALMESH_API_PORT=2690
LOCALMESH_DASHBOARD_PORT=2690
LOCALMESH_INSTALL_ROOT=/opt/localmesh
LOCALMESH_COMPOSE_FILE=/opt/localmesh/docker/docker-compose.yml
LOCALMESH_CLI_PATH=/usr/local/bin/localmesh
LOCALMESH_CERTS_DIR=/opt/localmesh/certs
LOCALMESH_UPDATE_TOKEN=$admin_token
LOCALMESH_ADGUARD_URL=http://127.0.0.1:3000
LOCALMESH_NPM_API_URL=http://127.0.0.1:81/api
# LOCALMESH_ADGUARD_USERNAME=
# LOCALMESH_ADGUARD_PASSWORD=
# LOCALMESH_NPM_IDENTITY=
# LOCALMESH_NPM_SECRET=
EOF
fi

chmod +x "$install_root/deploy/bin/localmesh" "$install_root/scripts/install-ubuntu.sh" "$install_root/deploy/docker/mkcert/entrypoint.sh"
ln -sf "$install_root/deploy/bin/localmesh" /usr/local/bin/localmesh

cd "$install_root"
npm install
npm run build

docker compose -f "$install_root/docker/docker-compose.yml" up -d --build
install -m 0644 "$install_root/deploy/systemd/localmesh.service" /etc/systemd/system/localmesh.service
install -m 0644 "$install_root/deploy/systemd/localmesh-stack.service" /etc/systemd/system/localmesh-stack.service
systemctl daemon-reload
systemctl enable --now localmesh-stack.service
systemctl enable --now localmesh.service

ufw allow 53/tcp || true
ufw allow 53/udp || true
ufw allow 80/tcp || true
ufw allow 81/tcp || true
ufw allow 443/tcp || true
ufw allow 2690/tcp || true
ufw allow 3000/tcp || true

echo "LocalMesh installed at $install_root"
echo "Dashboard: http://SERVER_IP:2690"
