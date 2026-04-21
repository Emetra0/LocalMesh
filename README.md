# LocalMesh

LocalMesh is a self-hosted local network manager for Ubuntu. It combines AdGuard Home, Nginx Proxy Manager, mkcert, and a Vite/React dashboard with an update workflow that can be triggered from the UI.

## What It Includes

- AdGuard Home for DNS and rewrites
- Nginx Proxy Manager for reverse proxy routes and SSL termination
- mkcert for a local certificate authority and internal HTTPS certificates
- A Vite/React dashboard served through the LocalMesh API on port 2690
- A `localmesh` CLI wrapper for restart, logs, update, backup, restore, and local certificate generation

## Default Ports

- AdGuard Home: `3000`
- Nginx Proxy Manager admin UI: `81`
- LocalMesh dashboard: `2690`
- DNS: `53/tcp` and `53/udp`
- HTTP: `80`
- HTTPS: `443`

## Install Layout

- Install root: `/opt/localmesh`
- CLI path: `/usr/local/bin/localmesh`
- Docker Compose file: `/opt/localmesh/docker/docker-compose.yml`
- Local CA certificate: `/opt/localmesh/ca/rootCA.pem`
- Runtime configuration: `/opt/localmesh/.env.production`

## Ubuntu Install

### Requirements

- Ubuntu server with sudo or root access
- Internet access for Docker image pulls and npm package install
- A Git clone of this repository on the server, or a release archive extracted to disk

### First Install

```bash
git clone https://github.com/Emetra0/LocalMesh.git
cd LocalMesh
sudo bash scripts/install-ubuntu.sh
```

The installer will:

- install Docker if it is missing
- install Node.js if it is missing
- copy the project into `/opt/localmesh`
- build the dashboard and API
- start the Docker stack
- install and enable the LocalMesh systemd units
- create `/opt/localmesh/.env.production` if it does not already exist
- create a random `LOCALMESH_UPDATE_TOKEN` for protected actions in the dashboard
- auto-detect the server IP and print the dashboard and service URLs in the terminal

### Configure Service Credentials

Edit `/opt/localmesh/.env.production` and set the real values for your server:

```env
LOCALMESH_SERVER_IP=10.0.0.10
LOCALMESH_ADGUARD_USERNAME=admin
LOCALMESH_ADGUARD_PASSWORD=replace-me
LOCALMESH_NPM_IDENTITY=admin@example.com
LOCALMESH_NPM_SECRET=replace-me
```

Then reload the services:

```bash
sudo systemctl restart localmesh-stack.service
sudo systemctl restart localmesh.service
```

### First Access

After a successful install, the installer prints the real service URLs automatically. You should not need to run a separate IP discovery command during the normal install flow.

- Dashboard: `http://SERVER_IP:2690`
- AdGuard Home: `http://SERVER_IP:3000`
- Nginx Proxy Manager: `http://SERVER_IP:81`

Protected dashboard actions such as update and one-click provisioning require the `LOCALMESH_UPDATE_TOKEN` from `/opt/localmesh/.env.production`.

## One-Click Domain Provisioning

The dashboard can provision a domain directly when the environment file contains working AdGuard Home and Nginx Proxy Manager credentials.

The provisioning flow will:

1. create or update the AdGuard DNS rewrite to the LocalMesh server IP
2. generate a local mkcert certificate when SSL is enabled
3. upload that certificate into Nginx Proxy Manager as a custom certificate
4. create or update the proxy host to the app IP and port

After enabling SSL, install `/opt/localmesh/ca/rootCA.pem` on every client device that should trust LocalMesh certificates.

## Operations

### Status

```bash
localmesh status
```

### Restart

```bash
localmesh restart
```

### Logs

```bash
localmesh logs adguard
localmesh logs nginx
localmesh logs mkcert
```

### Generate a Local Certificate

```bash
localmesh cert generate app.sky
```

### Update

```bash
localmesh update
```

### Backup

```bash
localmesh backup
```

### Restore

```bash
localmesh restore /path/to/backup.tar.gz
```

## Development

### Install dependencies

```bash
npm install
```

### Run the workspace in development

```bash
npm run dev
```

### Build and validate

```bash
npm run build
```

## GitHub Actions

This repository includes a CI workflow that runs on pushes and pull requests to `main`. The workflow installs dependencies with `npm ci` and validates the project with `npm run build`.

## Versioning

- `1.0.x` for bug fixes and small UI tweaks
- `1.x.0` for new features
- `x.0.0` for breaking changes

The first baseline tag is `v0.1.0`.
