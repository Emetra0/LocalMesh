import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { appConfig } from '../config.js';
import { getCurrentRevision, getUpdateSummary } from './gitService.js';
import { appendUpdateOutput, readUpdateState, writeUpdateState } from './runtimeState.js';

function resolveUpdateScript() {
  // When running inside Docker the script lives in the bind-mounted source tree.
  const fromInstallRoot = path.join(appConfig.installRoot, 'scripts', 'update-localmesh.sh');
  const fromRepoRoot = path.join(appConfig.repoRoot, 'scripts', 'update-localmesh.sh');
  return fromInstallRoot !== fromRepoRoot ? fromInstallRoot : fromRepoRoot;
}

export async function triggerUpdate() {
  const [state, summary] = await Promise.all([readUpdateState(), getUpdateSummary()]);
  if (state.status === 'running') {
    return false;
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  await writeUpdateState({
    status: 'running',
    startedAt,
    finishedAt: null,
    currentRunId: runId,
    output: ['Queued LocalMesh update'],
    history: state.history,
  });

  const scriptPath = resolveUpdateScript();
  const child = spawn('bash', [scriptPath], {
    detached: true,
    shell: false,
    env: {
      ...process.env,
      LOCALMESH_INSTALL_ROOT: appConfig.installRoot,
      LOCALMESH_COMPOSE_FILE: appConfig.composeFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', async (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      await appendUpdateOutput(text);
    }
  });

  child.stderr?.on('data', async (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      await appendUpdateOutput(text);
    }
  });

  child.on('close', async (code) => {
    const nextState = await readUpdateState();
    const deployedHash = await getCurrentRevision().catch(() => summary.localHash);
    const historyEntry = {
      id: runId,
      status: code === 0 ? 'completed' as const : 'failed' as const,
      startedAt,
      finishedAt: new Date().toISOString(),
      fromHash: summary.localHash,
      targetHash: summary.remoteHash,
      deployedHash,
      commits: summary.commits,
      error: code === 0 ? undefined : `Update exited with code ${code}`,
    };

    await writeUpdateState({
      ...nextState,
      status: code === 0 ? 'completed' : 'failed',
      finishedAt: historyEntry.finishedAt,
      currentRunId: null,
      history: [historyEntry, ...nextState.history].slice(0, 12),
      error: code === 0 ? undefined : `Update exited with code ${code}`,
    });
  });

  child.unref();
  return true;
}
