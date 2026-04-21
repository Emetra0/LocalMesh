import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../..');
const defaultInstallRoot = process.env.LOCALMESH_INSTALL_ROOT ?? repoRoot;

export const appConfig = {
  apiPort: Number(process.env.LOCALMESH_API_PORT ?? 4080),
  dashboardPort: Number(process.env.LOCALMESH_DASHBOARD_PORT ?? 2690),
  serverIp: process.env.LOCALMESH_SERVER_IP ?? '127.0.0.1',
  repoRoot,
  runtimeDir: path.join(repoRoot, 'apps', 'api', '.runtime'),
  dashboardDistDir: path.join(repoRoot, 'apps', 'dashboard', 'dist'),
  composeFile: process.env.LOCALMESH_COMPOSE_FILE ?? '/opt/localmesh/docker/docker-compose.yml',
  cliPath: process.env.LOCALMESH_CLI_PATH ?? '/usr/local/bin/localmesh',
  installRoot: defaultInstallRoot,
  certsDir: process.env.LOCALMESH_CERTS_DIR ?? path.join(defaultInstallRoot, 'certs'),
  updateToken: process.env.LOCALMESH_UPDATE_TOKEN ?? '',
  adguardUrl: process.env.LOCALMESH_ADGUARD_URL ?? 'http://127.0.0.1:3000',
  adguardUsername: process.env.LOCALMESH_ADGUARD_USERNAME ?? '',
  adguardPassword: process.env.LOCALMESH_ADGUARD_PASSWORD ?? '',
  npmApiUrl: process.env.LOCALMESH_NPM_API_URL ?? 'http://127.0.0.1:81/api',
  npmIdentity: process.env.LOCALMESH_NPM_IDENTITY ?? '',
  npmSecret: process.env.LOCALMESH_NPM_SECRET ?? '',
};
