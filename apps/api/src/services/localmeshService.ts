import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from '../config.js';
import { getCurrentRevision, getUpdateSummary } from './gitService.js';
import { appendUpdateOutput, readUpdateState, writeUpdateState } from './runtimeState.js';

function resolveCliPath() {
  if (fs.existsSync(appConfig.cliPath)) {
    return appConfig.cliPath;
  }

  return path.join(appConfig.repoRoot, 'deploy', 'bin', 'localmesh');
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

  const cliPath = resolveCliPath();
  const child = spawn(cliPath, ['update'], {
    cwd: appConfig.repoRoot,
    detached: true,
    shell: false,
    env: {
      ...process.env,
      LOCALMESH_INSTALL_ROOT: appConfig.installRoot,
      LOCALMESH_COMPOSE_FILE: appConfig.composeFile,
      LOCALMESH_REPO_ROOT: appConfig.repoRoot,
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
