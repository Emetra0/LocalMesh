#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${LOCALMESH_INSTALL_ROOT:-/opt/localmesh}"
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

# Print URLs immediately so they are always visible, even if a later step fails.
print_urls() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  LocalMesh server IP detected: ${server_ip}"
  echo ""
  echo "  Dashboard:            http://${server_ip}:2690"
  echo "  AdGuard Home:         http://${server_ip}:3000"
  echo "  Nginx Proxy Manager:  http://${server_ip}:81"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}
print_urls

# Re-print URLs on exit (success or failure) so they are never lost in scroll.
trap print_urls EXIT

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

# ── Deploy source to install root ────────────────────────────────────────────
mkdir -p "$install_root"
rsync -a --delete --exclude '.git' "$repo_root/" "$install_root/"

# Make install_root a proper git repo so the container can run git pull later.
if [[ ! -d "$install_root/.git" ]]; then
  git -C "$install_root" init -b main
  git -C "$install_root" remote add origin https://github.com/Emetra0/LocalMesh.git || true
  git -C "$install_root" fetch --depth=1 origin main 2>/dev/null || true
  git -C "$install_root" reset --soft FETCH_HEAD 2>/dev/null || true
fi

# Create persistent data directories
mkdir -p \
  "$install_root/ca" \
  "$install_root/certs" \
  "$install_root/data/adguard/work" \
  "$install_root/data/adguard/conf" \
  "$install_root/data/nginx/data" \
  "$install_root/data/nginx/letsencrypt" \
  "$install_root/data/localmesh" \
  "$install_root/docker"

cp "$install_root/deploy/docker/docker-compose.yml" "$install_root/docker/docker-compose.yml"

# ── Generate .env.production on first install ─────────────────────────────────
if [[ ! -f "$env_file" ]]; then
  admin_token="$(openssl rand -hex 24)"
  cat > "$env_file" <<EOF
LOCALMESH_SERVER_IP=$server_ip
LOCALMESH_API_PORT=2690
LOCALMESH_INSTALL_ROOT=/opt/localmesh
LOCALMESH_COMPOSE_FILE=/opt/localmesh/docker/docker-compose.yml
LOCALMESH_CLI_PATH=/usr/local/bin/localmesh
LOCALMESH_CERTS_DIR=/opt/localmesh/certs
LOCALMESH_CA_DIR=/opt/localmesh/ca
LOCALMESH_UPDATE_TOKEN=$admin_token
# Fill in your AdGuard Home credentials after first-run setup at http://${server_ip}:3000
# LOCALMESH_ADGUARD_USERNAME=
# LOCALMESH_ADGUARD_PASSWORD=
# Fill in your Nginx Proxy Manager credentials after first-run setup at http://${server_ip}:81
# LOCALMESH_NPM_IDENTITY=
# LOCALMESH_NPM_SECRET=
EOF
fi

current_server_ip="$(awk -F= '/^LOCALMESH_SERVER_IP=/{print $2}' "$env_file" | tail -n 1)"
if [[ -z "$current_server_ip" || "$current_server_ip" == "127.0.0.1" ]]; then
  upsert_env_value "LOCALMESH_SERVER_IP" "$server_ip"
fi

# ── Install CLI helper ────────────────────────────────────────────────────────
chmod +x "$install_root/deploy/bin/localmesh" "$install_root/scripts/install-ubuntu.sh"
ln -sf "$install_root/deploy/bin/localmesh" /usr/local/bin/localmesh

# ── Build and start the entire stack ─────────────────────────────────────────
echo "Building LocalMesh Docker image (this may take a few minutes on first run)..."
docker compose -f "$install_root/docker/docker-compose.yml" up -d --build

# ── Install and enable systemd unit ──────────────────────────────────────────
install -m 0644 "$install_root/deploy/systemd/localmesh.service" /etc/systemd/system/localmesh.service
systemctl daemon-reload
systemctl enable localmesh.service

# ── Firewall ──────────────────────────────────────────────────────────────────
ufw allow 53/tcp || true
ufw allow 53/udp || true
ufw allow 80/tcp  || true
ufw allow 81/tcp  || true
ufw allow 443/tcp || true
ufw allow 2690/tcp || true
ufw allow 3000/tcp || true

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      LocalMesh installed successfully    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "After completing first-run setup in AdGuard and NPM, edit"
echo "  /opt/localmesh/.env.production"
echo "to add your credentials, then run:  localmesh restart"

# Cancel the EXIT trap so we don't double-print
trap - EXIT
print_urls
