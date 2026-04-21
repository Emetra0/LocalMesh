import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from '../config.js';
import type { DomainProvisionRequest, DomainProvisionResult, ServiceIntegrationStatus } from '../types.js';
import { ensureDnsRewrite } from './adguardService.js';
import { createCustomCertificate, upsertProxyHost } from './nginxProxyManagerService.js';

function resolveCliPath() {
  if (fs.existsSync(appConfig.cliPath)) {
    return appConfig.cliPath;
  }

  return path.join(appConfig.repoRoot, 'deploy', 'bin', 'localmesh');
}

async function runLocalmeshCommand(args: string[]) {
  const cliPath = resolveCliPath();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(cliPath, args, {
      cwd: appConfig.repoRoot,
      env: {
        ...process.env,
        LOCALMESH_INSTALL_ROOT: appConfig.installRoot,
        LOCALMESH_COMPOSE_FILE: appConfig.composeFile,
        LOCALMESH_REPO_ROOT: appConfig.repoRoot,
      },
      stdio: 'ignore',
      shell: false,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`localmesh ${args.join(' ')} exited with code ${code}`));
    });
  });
}

export function getIntegrationStatus(): ServiceIntegrationStatus {
  return {
    adguard: {
      configured: Boolean(appConfig.adguardUrl),
      url: appConfig.adguardUrl,
    },
    nginxProxyManager: {
      configured: Boolean(appConfig.npmIdentity && appConfig.npmSecret),
      url: appConfig.npmApiUrl,
    },
    updateAuthRequired: Boolean(appConfig.updateToken),
  };
}

export async function provisionDomain(request: DomainProvisionRequest): Promise<DomainProvisionResult> {
  const dns = await ensureDnsRewrite(request.domain, appConfig.serverIp);
  let certificateId: number | null = null;
  const certFileName = `${request.domain}.pem`;
  const keyFileName = `${request.domain}-key.pem`;

  if (request.ssl) {
    await runLocalmeshCommand(['cert', 'generate', request.domain]);
    certificateId = await createCustomCertificate(request.domain, certFileName, keyFileName);
  }

  const proxy = await upsertProxyHost(
    request.domain,
    request.appIp,
    request.appPort,
    request.ssl,
    certificateId ?? 0,
  );

  return {
    domain: request.domain,
    dns,
    certificate: request.ssl
      ? {
          status: 'created',
          certificateId,
          certificatePath: path.join(appConfig.certsDir, certFileName),
          keyPath: path.join(appConfig.certsDir, keyFileName),
        }
      : {
          status: 'skipped',
          certificateId: null,
        },
    proxy,
    notes: request.ssl
      ? ['Install /opt/localmesh/ca/rootCA.pem on each client device to avoid browser trust warnings.']
      : ['SSL was skipped for this route.'],
  };
}