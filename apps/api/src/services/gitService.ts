import { simpleGit } from 'simple-git';
import { appConfig } from '../config.js';
import type { UpdateSummary } from '../types.js';

export async function getCurrentRevision() {
  try {
    const git = simpleGit(appConfig.repoRoot);
    return (await git.revparse(['HEAD'])).trim();
  } catch {
    return 'unknown';
  }
}

export async function getUpdateSummary(): Promise<UpdateSummary> {
  const git = simpleGit(appConfig.repoRoot);

  let branch = 'unknown';
  let localHash = 'unknown';
  try {
    const status = await git.status();
    branch = status.current ?? 'unknown';
    localHash = (await git.revparse(['HEAD'])).trim();
  } catch {
    // Not a git repo (e.g. running inside Docker without a bind-mount)
    return { branch: 'unknown', localHash: 'unknown', remoteHash: null, isBehind: false, commits: [] };
  }

  let remoteHash: string | null = null;
  try {
    await git.fetch();
    remoteHash = (await git.revparse([`origin/${branch}`])).trim();
  } catch {
    remoteHash = null;
  }

  const log = remoteHash
    ? await git.log({ from: localHash, to: remoteHash })
    : { all: [] };

  return {
    branch,
    localHash,
    remoteHash,
    isBehind: Boolean(remoteHash && remoteHash !== localHash),
    commits: log.all.map((entry: { hash: string; message: string; author_name: string; date: string }) => ({
      hash: entry.hash,
      message: entry.message,
      author: entry.author_name,
      date: entry.date,
    })),
  };
}
