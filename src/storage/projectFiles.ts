import fs from "fs";
import path from "path";
import archiver from "archiver";
import extractZip from "extract-zip";
import {
  ensureDir,
  getProjectDir,
  isGeneratedOrInternal,
  resolveProjectPath,
  SNAPSHOTS_DIR,
} from "./paths";

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
