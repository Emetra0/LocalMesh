import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { appConfig } from './config.js';
import { isAdminTokenValid } from './services/auth.js';
import { deleteDnsRewrite, ensureDnsRewrite, listDnsRewrites } from './services/adguardService.js';
import { deleteProxyHost, listProxyHosts } from './services/nginxProxyManagerService.js';
import { getIntegrationStatus, provisionDomain } from './services/domainService.js';
import { getUpdateSummary } from './services/gitService.js';
import { triggerUpdate } from './services/localmeshService.js';
import { readUpdateState } from './services/runtimeState.js';

const app = express();

app.use(cors());
app.use(express.json());

function requireAdminToken(request: Request, response: Response, next: NextFunction) {
  const token = request.header('x-localmesh-admin-token');
  if (!isAdminTokenValid(token ?? undefined)) {
    response.status(401).json({
      ok: false,
      error: 'Invalid LocalMesh admin token',
    });
    return;
  }

  next();
}

app.get('/api/health', async (_request, response) => {
  response.json({
    ok: true,
    serverIp: appConfig.serverIp,
    dashboardPort: appConfig.dashboardPort,
    apiPort: appConfig.apiPort,
    installRoot: appConfig.installRoot,
    composeFile: appConfig.composeFile,
    integrations: getIntegrationStatus(),
  });
});

app.get('/api/update/status', async (_request, response, next) => {
  try {
    const [summary, runtime] = await Promise.all([
      getUpdateSummary(),
      readUpdateState(),
    ]);

    response.json({ summary, runtime });
  } catch (error) {
    next(error);
  }
});

app.post('/api/update', requireAdminToken, async (_request, response, next) => {
  try {
    const accepted = await triggerUpdate();
    response.status(accepted ? 202 : 409).json({
      accepted,
      message: accepted ? 'Update queued' : 'Update already running',
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/domains/provision', requireAdminToken, async (request, response, next) => {
  try {
    const body = request.body as { domain?: string; appIp?: string; appPort?: number; ssl?: boolean };
    if (!body.domain || !body.appIp || !body.appPort) {
      response.status(400).json({
        ok: false,
        error: 'domain, appIp, and appPort are required',
      });
      return;
    }

    const result = await provisionDomain({
      domain: body.domain,
      appIp: body.appIp,
      appPort: Number(body.appPort),
      ssl: Boolean(body.ssl),
    });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// ── DNS rewrite management ───────────────────────────────────────────────────
app.get('/api/dns/rewrites', async (_request, response, next) => {
  try {
    response.json(await listDnsRewrites());
  } catch (error) {
    next(error);
  }
});

app.delete('/api/dns/rewrites', requireAdminToken, async (request, response, next) => {
  try {
    const { domain, answer } = request.body as { domain: string; answer: string };
    await deleteDnsRewrite(domain, answer);
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ── Proxy host management ────────────────────────────────────────────────────
app.get('/api/proxy/hosts', async (_request, response, next) => {
  try {
    response.json(await listProxyHosts());
  } catch (error) {
    next(error);
  }
});

app.delete('/api/proxy/hosts/:id', requireAdminToken, async (request, response, next) => {
  try {
    await deleteProxyHost(Number(request.params.id));
    response.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

const dashboardIndexFile = path.join(appConfig.dashboardDistDir, 'index.html');
if (fs.existsSync(dashboardIndexFile)) {
  app.use(express.static(appConfig.dashboardDistDir));
  app.get('*', (_request, response) => {
    response.sendFile(dashboardIndexFile);
  });
}

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  response.status(500).json({
    ok: false,
    error: error.message,
  });
});

app.listen(appConfig.apiPort, '0.0.0.0', () => {
  console.log(`LocalMesh API listening on ${appConfig.apiPort}`);
});
