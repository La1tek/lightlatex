import fs from "fs";
import path from "path";
import archiver from "archiver";
import extractZip from "extract-zip";

const PROJECTS_DIR = process.env.PROJECTS_DIR || "./data/projects";

export function getProjectDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId);
}

export async function ensureProjectDir(projectId: string): Promise<void> {
  await ensureDir(getProjectDir(projectId));
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function readFile(projectId: string, filePath: string): Promise<string> {
  const fullPath = path.join(getProjectDir(projectId), filePath);
  if (!fullPath.startsWith(getProjectDir(projectId))) {
    throw new Error("Invalid file path");
  }
  try {
    return await fs.promises.readFile(fullPath, "utf-8");
  } catch {
    throw new Error("File not found");
  }
}

export async function writeFile(projectId: string, filePath: string, content: string): Promise<void> {
  const fullPath = path.join(getProjectDir(projectId), filePath);
  if (!fullPath.startsWith(getProjectDir(projectId))) {
    throw new Error("Invalid file path");
  }
  await ensureDir(path.dirname(fullPath));
  await fs.promises.writeFile(fullPath, content, "utf-8");
}

export async function deleteFile(projectId: string, filePath: string): Promise<void> {
  const fullPath = path.join(getProjectDir(projectId), filePath);
  if (!fullPath.startsWith(getProjectDir(projectId))) {
    throw new Error("Invalid file path");
  }
  try {
    await fs.promises.unlink(fullPath);
    // Try to clean up empty directories
    await cleanEmptyDirs(path.dirname(fullPath), getProjectDir(projectId));
  } catch {
    throw new Error("File not found");
  }
}

async function cleanEmptyDirs(dir: string, base: string): Promise<void> {
  if (dir === base) return;
  try {
    const entries = await fs.promises.readdir(dir);
    if (entries.length === 0) {
      await fs.promises.rmdir(dir);
      await cleanEmptyDirs(path.dirname(dir), base);
    }
  } catch {
    // ignore
  }
}

export async function listFiles(projectId: string): Promise<string[]> {
  const dir = getProjectDir(projectId);
  if (!fs.existsSync(dir)) return [];
  const result: string[] = [];
  async function walk(d: string, base: string = "") {
    const entries = await fs.promises.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(d, entry.name), rel);
      } else {
        result.push(rel);
      }
    }
  }
  await walk(dir);
  return result;
}

export async function removeProjectDir(projectId: string): Promise<void> {
  const dir = getProjectDir(projectId);
  await fs.promises.rm(dir, { recursive: true, force: true });
}

export async function extractZipToProject(projectId: string, zipPath: string): Promise<void> {
  const targetDir = getProjectDir(projectId);
  await extractZip(zipPath, { dir: targetDir });
}

export async function zipProject(projectId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    const dir = getProjectDir(projectId);
    archive.directory(dir, false);
    archive.finalize();
  });
}

// ===== Snapshots =====
export async function createSnapshot(projectId: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotsDir = path.join(getProjectDir(projectId), '.snapshots', timestamp);
  const projectDir = getProjectDir(projectId);
  await ensureDir(snapshotsDir);
  const entries = await fs.promises.readdir(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.snapshots' || entry.name === 'output.pdf' || entry.name === 'output.log') continue;
    const src = path.join(projectDir, entry.name);
    const dest = path.join(snapshotsDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(src, dest);
    } else {
      await fs.promises.copyFile(src, dest);
    }
  }
  return timestamp;
}

async function copyDirRecursive(src: string, dest: string) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

export async function listSnapshots(projectId: string): Promise<string[]> {
  const snapshotsDir = path.join(getProjectDir(projectId), '.snapshots');
  try {
    const entries = await fs.promises.readdir(snapshotsDir);
    return entries.sort().reverse();
  } catch {
    return [];
  }
}

export async function getSnapshotFile(projectId: string, timestamp: string, filePath: string): Promise<string> {
  const fullPath = path.join(getProjectDir(projectId), '.snapshots', timestamp, filePath);
  return fs.promises.readFile(fullPath, 'utf-8');
}

export async function renameFile(projectId: string, oldPath: string, newPath: string): Promise<void> {
  const oldFullPath = path.join(getProjectDir(projectId), oldPath);
  const newFullPath = path.join(getProjectDir(projectId), newPath);
  if (!oldFullPath.startsWith(getProjectDir(projectId)) || !newFullPath.startsWith(getProjectDir(projectId))) {
    throw new Error("Invalid file path");
  }
  await ensureDir(path.dirname(newFullPath));
  await fs.promises.rename(oldFullPath, newFullPath);
}
