import { simpleGit } from 'simple-git';
import { appConfig } from '../config.js';
import type { UpdateSummary } from '../types.js';

export async function getCurrentRevision() {
  const git = simpleGit(appConfig.repoRoot);
  return (await git.revparse(['HEAD'])).trim();
}

export async function getUpdateSummary(): Promise<UpdateSummary> {
  const git = simpleGit(appConfig.repoRoot);
  const status = await git.status();
  const branch = status.current ?? 'unknown';

  let remoteHash: string | null = null;
  try {
    await git.fetch();
    remoteHash = (await git.revparse([`origin/${branch}`])).trim();
  } catch {
    remoteHash = null;
  }

  const localHash = await getCurrentRevision();
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
