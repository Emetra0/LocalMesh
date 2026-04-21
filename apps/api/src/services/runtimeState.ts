import fs from 'node:fs/promises';
import path from 'node:path';
import { appConfig } from '../config.js';
import type { RuntimeUpdateState } from '../types.js';

const stateFile = path.join(appConfig.runtimeDir, 'update-state.json');

const defaultState: RuntimeUpdateState = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  currentRunId: null,
  output: [],
  history: [],
};

async function ensureRuntimeDir() {
  await fs.mkdir(appConfig.runtimeDir, { recursive: true });
}

export async function readUpdateState(): Promise<RuntimeUpdateState> {
  await ensureRuntimeDir();
  try {
    const rawState = await fs.readFile(stateFile, 'utf8');
    return JSON.parse(rawState) as RuntimeUpdateState;
  } catch {
    await writeUpdateState(defaultState);
    return defaultState;
  }
}

export async function writeUpdateState(state: RuntimeUpdateState) {
  await ensureRuntimeDir();
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

export async function appendUpdateOutput(line: string) {
  const currentState = await readUpdateState();
  currentState.output = [...currentState.output, line].slice(-300);
  await writeUpdateState(currentState);
}
