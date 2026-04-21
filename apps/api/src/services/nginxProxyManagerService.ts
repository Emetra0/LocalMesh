import fs from 'node:fs/promises';
import path from 'node:path';
import { appConfig } from '../config.js';

interface TokenResponse {
  token: string;
}

interface ProxyHost {
  id: number;
  domain_names: string[];
  forward_scheme: string;
  forward_host: string;
  forward_port: number;
  access_list_id: number;
  certificate_id: number;
  ssl_forced: boolean;
  caching_enabled: boolean;
  block_exploits: boolean;
  advanced_config: string;
  meta: Record<string, unknown>;
  allow_websocket_upgrade: boolean;
  http2_support: boolean;
  enabled: boolean;
  hsts_enabled: boolean;
  hsts_subdomains: boolean;
  locations: Array<Record<string, unknown>>;
}

async function getNpmToken() {
  if (!appConfig.npmIdentity || !appConfig.npmSecret) {
    throw new Error('Nginx Proxy Manager credentials are not configured');
  }

  const response = await fetch(new URL('/tokens', appConfig.npmApiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identity: appConfig.npmIdentity, secret: appConfig.npmSecret }),
  });

  if (!response.ok) {
    throw new Error(`Nginx Proxy Manager token request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as TokenResponse;
  return payload.token;
}

async function npmRequest<T>(pathname: string, init: RequestInit = {}) {
  const token = await getNpmToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(new URL(pathname, appConfig.npmApiUrl), {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Nginx Proxy Manager request failed for ${pathname}: ${response.status} ${body}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export async function createCustomCertificate(domain: string, certFileName: string, keyFileName: string) {
  const certificate = await npmRequest<{ id: number }>(`/nginx/certificates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: 'other',
      nice_name: `LocalMesh ${domain}`,
    }),
  });

  const formData = new FormData();
  const certificateBuffer = await fs.readFile(path.join(appConfig.certsDir, certFileName));
  const keyBuffer = await fs.readFile(path.join(appConfig.certsDir, keyFileName));
  formData.append('certificate', new Blob([certificateBuffer]), certFileName);
  formData.append('certificate_key', new Blob([keyBuffer]), keyFileName);

  await npmRequest(`/nginx/certificates/${certificate.id}/upload`, {
    method: 'POST',
    body: formData,
  });

  return certificate.id;
}

function buildProxyPayload(domain: string, appIp: string, appPort: number, ssl: boolean, certificateId: number) {
  return {
    domain_names: [domain],
    forward_scheme: 'http',
    forward_host: appIp,
    forward_port: appPort,
    access_list_id: 0,
    certificate_id: certificateId,
    ssl_forced: ssl,
    caching_enabled: false,
    block_exploits: true,
    advanced_config: '',
    meta: {},
    allow_websocket_upgrade: true,
    http2_support: ssl,
    enabled: true,
    hsts_enabled: false,
    hsts_subdomains: false,
    locations: [],
  };
}

export async function upsertProxyHost(domain: string, appIp: string, appPort: number, ssl: boolean, certificateId: number) {
  const existingHosts = await npmRequest<ProxyHost[]>('/nginx/proxy-hosts');
  const existing = existingHosts.find((host) => host.domain_names.includes(domain));

  if (!existing) {
    const created = await npmRequest<{ id: number }>('/nginx/proxy-hosts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildProxyPayload(domain, appIp, appPort, ssl, certificateId)),
    });

    return { status: 'created' as const, hostId: created.id };
  }

  const updatedPayload = {
    ...existing,
    ...buildProxyPayload(domain, appIp, appPort, ssl, certificateId),
  };
  const updated = await npmRequest<{ id: number }>(`/nginx/proxy-hosts/${existing.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatedPayload),
  });

  return { status: 'updated' as const, hostId: updated.id };
}