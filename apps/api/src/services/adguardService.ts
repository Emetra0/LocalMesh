import { appConfig } from '../config.js';

interface RewriteEntry {
  domain: string;
  answer: string;
  enabled?: boolean;
}

async function loginToAdGuard() {
  if (!appConfig.adguardUsername || !appConfig.adguardPassword) {
    return '';
  }

  const response = await fetch(new URL('/control/login', appConfig.adguardUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: appConfig.adguardUsername,
      password: appConfig.adguardPassword,
    }),
  });

  if (!response.ok) {
    throw new Error(`AdGuard login failed with status ${response.status}`);
  }

  return response.headers.getSetCookie().join('; ');
}

async function adguardRequest(pathname: string, init: RequestInit = {}) {
  const cookie = await loginToAdGuard();
  const headers = new Headers(init.headers);
  if (cookie) {
    headers.set('Cookie', cookie);
  }

  const response = await fetch(new URL(pathname, appConfig.adguardUrl), {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(`AdGuard request failed for ${pathname} with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

export async function ensureDnsRewrite(domain: string, answer: string) {
  const existing = (await adguardRequest('/control/rewrite/list')) as RewriteEntry[];
  const current = existing.find((entry) => entry.domain === domain);

  if (!current) {
    await adguardRequest('/control/rewrite/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain, answer, enabled: true }),
    });

    return { status: 'created' as const, answer };
  }

  if (current.answer === answer) {
    return { status: 'unchanged' as const, answer };
  }

  await adguardRequest('/control/rewrite/update', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target: { domain: current.domain, answer: current.answer },
      update: { domain, answer, enabled: true },
    }),
  });

  return { status: 'updated' as const, answer };
}

export async function listDnsRewrites() {
  return (await adguardRequest('/control/rewrite/list')) as RewriteEntry[];
}

export async function deleteDnsRewrite(domain: string, answer: string) {
  await adguardRequest('/control/rewrite/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain, answer }),
  });
}