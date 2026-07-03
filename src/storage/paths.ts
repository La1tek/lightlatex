import fs from "fs";
import path from "path";

export const PROJECTS_DIR = process.env.PROJECTS_DIR || "./data/projects";
export const SNAPSHOTS_DIR = ".snapshots";

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

export function resolveInside(baseDir: string, ...segments: string[]): string {
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

export function isGeneratedOrInternal(relPath: string): boolean {
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
