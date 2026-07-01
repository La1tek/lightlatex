import crypto from "crypto";

export function sha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function sha256File(filePath: string): Promise<string> {
  const fs = require("fs/promises");
  return fs.readFile(filePath).then((buf: Buffer) => sha256(buf));
}

export interface FileHash {
  path: string;
  hash: string;
}

export interface SyncDiff {
  pushed: string[];
  pulled: Array<{ path: string; hash: string; content?: string }>;
  conflicts: string[];
}

export function computeDiff(
  localFiles: FileHash[],
  remoteFiles: FileHash[]
): { toPush: FileHash[]; toPull: FileHash[]; conflicts: FileHash[] } {
  const localMap = new Map(localFiles.map((f) => [f.path, f]));
  const remoteMap = new Map(remoteFiles.map((f) => [f.path, f]));

  const toPush: FileHash[] = [];
  const toPull: FileHash[] = [];
  const conflicts: FileHash[] = [];

  // Check local files against remote
  for (const [path, local] of localMap) {
    const remote = remoteMap.get(path);
    if (!remote) {
      // File only exists locally
      toPush.push(local);
    } else if (local.hash !== remote.hash) {
      // Both exist with different hashes — conflict, local wins
      conflicts.push(local);
      toPush.push(local);
    }
    // else: same hash, no action needed
  }

  // Check remote files not in local
  for (const [path, remote] of remoteMap) {
    if (!localMap.has(path)) {
      toPull.push(remote);
    }
  }

  return { toPush, toPull, conflicts };
}
