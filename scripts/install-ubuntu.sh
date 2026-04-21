#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${LOCALMESH_INSTALL_ROOT:-/opt/localmesh}"
node_major="${LOCALMESH_NODE_MAJOR:-22}"
env_file="$install_root/.env.production"

detect_server_ip() {
  local detected_ip

  detected_ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
  if [[ -n "$detected_ip" ]]; then
    printf '%s\n' "$detected_ip"
    return 0
  fi

  detected_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -n "$detected_ip" ]]; then
    printf '%s\n' "$detected_ip"
    return 0
  fi

  printf '127.0.0.1\n'
}

configure_dns_if_needed() {
  if getent hosts github.com >/dev/null 2>&1; then
    return 0
  fi

  if ! ping -c 1 -W 2 1.1.1.1 >/dev/null 2>&1; then
    echo "Internet connectivity is unavailable, so LocalMesh cannot repair DNS automatically." >&2
    return 0
  fi

  echo "DNS resolution is broken. Applying LocalMesh resolver fallback." >&2
  mkdir -p /etc/systemd/resolved.conf.d
  cat > /etc/systemd/resolved.conf.d/localmesh-dns.conf <<'EOF'
[Resolve]
DNS=1.1.1.1 8.8.8.8
FallbackDNS=9.9.9.9 8.8.4.4
EOF

  if systemctl list-unit-files systemd-resolved.service >/dev/null 2>&1; then
    systemctl restart systemd-resolved || true
  fi

  if [[ -e /run/systemd/resolve/resolv.conf ]]; then
    ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
  else
    cat > /etc/resolv.conf <<'EOF'
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF
  fi
}

upsert_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$env_file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 1
fi

server_ip="$(detect_server_ip)"

configure_dns_if_needed

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
  if curl -fsSL "https://deb.nodesource.com/setup_${node_major}.x" | bash -; then
    apt-get install -y nodejs
  else
    echo "NodeSource could not be reached, falling back to Ubuntu nodejs package." >&2
    apt-get update
    apt-get install -y nodejs npm
  fi
fi

mkdir -p "$install_root"
rsync -a --delete --exclude '.git' "$repo_root/" "$install_root/"
mkdir -p "$install_root/ca" "$install_root/certs" "$install_root/data" "$install_root/docker"
cp "$install_root/deploy/docker/docker-compose.yml" "$install_root/docker/docker-compose.yml"
rsync -a --delete "$install_root/deploy/docker/mkcert/" "$install_root/docker/mkcert/"

if [[ ! -f "$env_file" ]]; then
  admin_token="$(openssl rand -hex 24)"
  cat > "$env_file" <<EOF
LOCALMESH_SERVER_IP=$server_ip
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

current_server_ip="$(awk -F= '/^LOCALMESH_SERVER_IP=/{print $2}' "$env_file" | tail -n 1)"
if [[ -z "$current_server_ip" || "$current_server_ip" == "127.0.0.1" ]]; then
  upsert_env_value "LOCALMESH_SERVER_IP" "$server_ip"
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
echo "Dashboard: http://${server_ip}:2690"
echo "AdGuard Home: http://${server_ip}:3000"
echo "Nginx Proxy Manager: http://${server_ip}:81"
