import fs from "fs";
import path from "path";
import archiver from "archiver";
import { ensureDir, getProjectDir, resolveInside, SNAPSHOTS_DIR } from "./paths";
import { listFiles } from "./projectFiles";

export async function zipSnapshot(projectId: string, timestamp: string): Promise<Buffer> {
  if (!timestamp || timestamp.includes("/") || timestamp.includes("\\")) {
    throw new Error("Invalid snapshot timestamp");
  }
  const snapshotDir = path.join(getProjectDir(projectId), SNAPSHOTS_DIR, timestamp);
  await fs.promises.access(snapshotDir);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    async function walk(dir: string, base: string = "") {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const rel = base ? `${base}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath, rel);
        } else {
          archive.file(fullPath, { name: rel });
        }
      }
    }

    walk(snapshotDir)
      .then(() => archive.finalize())
      .catch(reject);
  });
}

export async function createSnapshot(projectId: string, metadata: Record<string, unknown> = {}): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotsDir = path.join(getProjectDir(projectId), SNAPSHOTS_DIR, timestamp);
  const projectDir = getProjectDir(projectId);
  await ensureDir(snapshotsDir);
  const files = await listFiles(projectId);
  for (const relPath of files) {
    const src = path.join(projectDir, relPath);
    const dest = path.join(snapshotsDir, relPath);
    await ensureDir(path.dirname(dest));
    await fs.promises.copyFile(src, dest);
  }
  await fs.promises.writeFile(
    path.join(snapshotsDir, ".lighttex-snapshot.json"),
    JSON.stringify({
      timestamp,
      createdAt: new Date().toISOString(),
      ...metadata,
    }, null, 2),
    "utf-8",
  );
  return timestamp;
}

export async function listSnapshots(projectId: string): Promise<string[]> {
  const snapshotsDir = path.join(getProjectDir(projectId), SNAPSHOTS_DIR);
  try {
    const entries = await fs.promises.readdir(snapshotsDir);
    return entries.sort().reverse();
  } catch {
    return [];
  }
}

export async function listSnapshotDetails(projectId: string): Promise<Array<Record<string, unknown>>> {
  const snapshots = await listSnapshots(projectId);
  const snapshotsDir = path.join(getProjectDir(projectId), SNAPSHOTS_DIR);
  const details = [];
  for (const timestamp of snapshots) {
    const metadataPath = path.join(snapshotsDir, timestamp, ".lighttex-snapshot.json");
    try {
      const raw = await fs.promises.readFile(metadataPath, "utf-8");
      details.push({ timestamp, ...JSON.parse(raw) });
    } catch {
      details.push({ timestamp, createdAt: snapshotTimestampToIso(timestamp), type: "compile" });
    }
  }
  return details;
}

function snapshotTimestampToIso(timestamp: string): string {
  const match = String(timestamp).match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z$/);
  if (!match) return timestamp;
  return `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`;
}

export async function getSnapshotFile(projectId: string, timestamp: string, filePath: string): Promise<string> {
  if (!timestamp || timestamp.includes("/") || timestamp.includes("\\")) {
    throw new Error("Invalid snapshot timestamp");
  }
  const snapshotDir = path.join(getProjectDir(projectId), SNAPSHOTS_DIR, timestamp);
  const fullPath = resolveInside(snapshotDir, filePath);
  return fs.promises.readFile(fullPath, "utf-8");
}
