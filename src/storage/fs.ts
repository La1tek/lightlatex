import fs from "fs";
import path from "path";
import archiver from "archiver";
import extractZip from "extract-zip";

const PROJECTS_DIR = process.env.PROJECTS_DIR || "./data/projects";
const SNAPSHOTS_DIR = ".snapshots";
const GENERATED_OUTPUTS = new Set([
  "output.pdf",
  "output.log",
  "output.aux",
  "output.out",
  "output.toc",
  "output.fls",
  "output.fdb_latexmk",
]);

export function getProjectDir(projectId: string): string {
  return path.resolve(PROJECTS_DIR, projectId);
}

function resolveInside(baseDir: string, ...segments: string[]): string {
  const base = path.resolve(baseDir);
  const fullPath = path.resolve(base, ...segments);
  if (fullPath !== base && !fullPath.startsWith(base + path.sep)) {
    throw new Error("Invalid file path");
  }
  return fullPath;
}

export function resolveProjectPath(projectId: string, filePath: string): string {
  if (!filePath || path.isAbsolute(filePath)) {
    throw new Error("Invalid file path");
  }
  return resolveInside(getProjectDir(projectId), filePath);
}

function isGeneratedOrInternal(relPath: string): boolean {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized === SNAPSHOTS_DIR || normalized.startsWith(`${SNAPSHOTS_DIR}/`)) return true;
  if (GENERATED_OUTPUTS.has(normalized)) return true;
  if (normalized.endsWith(".synctex.gz")) return true;
  return false;
}

export async function ensureProjectDir(projectId: string): Promise<void> {
  await ensureDir(getProjectDir(projectId));
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function readFile(projectId: string, filePath: string): Promise<string> {
  const fullPath = resolveProjectPath(projectId, filePath);
  try {
    return await fs.promises.readFile(fullPath, "utf-8");
  } catch {
    throw new Error("File not found");
  }
}

export async function writeFile(projectId: string, filePath: string, content: string): Promise<void> {
  const fullPath = resolveProjectPath(projectId, filePath);
  await ensureDir(path.dirname(fullPath));
  await fs.promises.writeFile(fullPath, content, "utf-8");
}

export async function deleteFile(projectId: string, filePath: string): Promise<void> {
  const fullPath = resolveProjectPath(projectId, filePath);
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
        if (entry.name === SNAPSHOTS_DIR) continue;
        await walk(path.join(d, entry.name), rel);
      } else {
        if (isGeneratedOrInternal(rel)) continue;
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
    listFiles(projectId)
      .then((paths) => {
        for (const relPath of paths) {
          archive.file(path.join(dir, relPath), { name: relPath });
        }
        archive.finalize();
      })
      .catch(reject);
  });
}

// ===== Snapshots =====
export async function createSnapshot(projectId: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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
  const snapshotsDir = path.join(getProjectDir(projectId), SNAPSHOTS_DIR);
  try {
    const entries = await fs.promises.readdir(snapshotsDir);
    return entries.sort().reverse();
  } catch {
    return [];
  }
}

export async function getSnapshotFile(projectId: string, timestamp: string, filePath: string): Promise<string> {
  if (!timestamp || timestamp.includes("/") || timestamp.includes("\\")) {
    throw new Error("Invalid snapshot timestamp");
  }
  const snapshotDir = path.join(getProjectDir(projectId), SNAPSHOTS_DIR, timestamp);
  const fullPath = resolveInside(snapshotDir, filePath);
  return fs.promises.readFile(fullPath, 'utf-8');
}

export async function renameFile(projectId: string, oldPath: string, newPath: string): Promise<void> {
  const oldFullPath = resolveProjectPath(projectId, oldPath);
  const newFullPath = resolveProjectPath(projectId, newPath);
  const targetExists = await fs.promises.access(newFullPath).then(() => true).catch(() => false);
  if (targetExists) {
    throw new Error("Target file already exists");
  }
  await ensureDir(path.dirname(newFullPath));
  await fs.promises.rename(oldFullPath, newFullPath);
}
