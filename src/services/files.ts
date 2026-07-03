import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { requireProjectAccess } from "../auth/projectAccess";
import { db } from "../db";
import { files } from "../db/schema";
import { BINARY_FILE_EXTENSIONS } from "../shared/constants";
import { HttpError } from "../shared/errors";
import {
  createSnapshot,
  deleteFile,
  ensureDir,
  extractZipToProject,
  getProjectDir,
  getSnapshotFile,
  listSnapshotDetails,
  listSnapshots,
  readFile,
  renameFile,
  resolveProjectPath,
  writeFile,
  zipProject,
  zipSnapshot,
} from "../storage/fs";
import { syncFileRecords, upsertFileRecord } from "../storage/fileRegistry";

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/svg+xml", "application/pdf"]);
const CHECKPOINT_COOLDOWN_MS = 2 * 60 * 1000;
const checkpointTimes = new Map<string, number>();

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

type UploadedFile = {
  path: string;
  mimetype: string;
  originalname: string;
};

function scheduleCheckpoint(projectId: string, message: string) {
  const now = Date.now();
  const last = checkpointTimes.get(projectId) || 0;
  if (now - last < CHECKPOINT_COOLDOWN_MS) return;
  checkpointTimes.set(projectId, now);
  createSnapshot(projectId, {
    type: "autosave",
    message,
  }).catch(() => {
    // Checkpoints are best-effort and should never fail file writes.
  });
}

export async function listProjectFiles(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  return db.select().from(files).where(eq(files.projectId, projectId));
}

export async function createProjectFile(projectId: string, userId: string, input: { path?: string; content?: string }) {
  await requireProjectAccess(projectId, userId, "editor");
  if (!input.path) throw new HttpError("File path required", 400);

  await writeFile(projectId, input.path, input.content || "");
  const file = await upsertFileRecord(projectId, input.path);
  scheduleCheckpoint(projectId, `Created ${input.path}`);
  return file;
}

export async function getProjectFile(projectId: string, userId: string, filePath: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  if (!filePath) throw new HttpError("File path required", 400);

  const ext = (filePath.split(".").pop() || "").toLowerCase();
  if (BINARY_FILE_EXTENSIONS.has(ext)) {
    const content = await fs.readFile(resolveProjectPath(projectId, filePath));
    return { content, type: MIME_TYPES[ext] || "application/octet-stream" };
  }

  const content = await readFile(projectId, filePath);
  return { content, type: "text/plain" };
}

export async function renameProjectFile(projectId: string, userId: string, input: { oldPath?: string; newPath?: string }) {
  await requireProjectAccess(projectId, userId, "editor");
  const { oldPath, newPath } = input;
  if (!oldPath || !newPath) throw new HttpError("oldPath and newPath required", 400);

  await renameFile(projectId, oldPath, newPath);
  await db.delete(files).where(and(eq(files.projectId, projectId), eq(files.path, oldPath)));
  await upsertFileRecord(projectId, newPath);
  scheduleCheckpoint(projectId, `Renamed ${oldPath} to ${newPath}`);
}

export async function updateProjectFile(projectId: string, userId: string, filePath: string, content: unknown) {
  await requireProjectAccess(projectId, userId, "editor");
  if (content === undefined) throw new HttpError("Content required", 400);

  await writeFile(projectId, filePath, String(content));
  await upsertFileRecord(projectId, filePath);
  scheduleCheckpoint(projectId, `Updated ${filePath}`);
}

export async function deleteProjectFile(projectId: string, userId: string, filePath: string) {
  await requireProjectAccess(projectId, userId, "editor");
  await deleteFile(projectId, filePath);
  await db.delete(files)
    .where(and(eq(files.projectId, projectId), eq(files.path, filePath)));
  scheduleCheckpoint(projectId, `Deleted ${filePath}`);
}

export async function importProjectZip(projectId: string, userId: string, uploadPath: string) {
  await requireProjectAccess(projectId, userId, "editor");
  await extractZipToProject(projectId, uploadPath);
  await syncFileRecords(projectId);
}

export async function getProjectZip(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  return zipProject(projectId);
}

export async function uploadProjectAsset(projectId: string, userId: string, uploaded: UploadedFile) {
  await requireProjectAccess(projectId, userId, "editor");
  if (!ALLOWED_IMAGE_TYPES.has(uploaded.mimetype)) {
    throw new HttpError("Unsupported file type. Allowed: png, jpg, gif, svg, pdf", 400);
  }

  const originalName = uploaded.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const imagesDir = path.join(getProjectDir(projectId), "images");
  await ensureDir(imagesDir);
  const destPath = path.join(imagesDir, originalName);
  await fs.rename(uploaded.path, destPath);

  const filePath = `images/${originalName}`;
  await upsertFileRecord(projectId, filePath);

  return { ok: true, path: filePath, name: originalName };
}

export async function listProjectAssets(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  const allFiles = await db.select().from(files).where(eq(files.projectId, projectId));
  return allFiles
    .filter(f => f.path.startsWith("images/"))
    .map(f => ({ path: f.path, name: f.path.replace("images/", "") }));
}

export async function listProjectFilesWithHashes(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  const list = await db.select().from(files).where(eq(files.projectId, projectId));
  const result = [];
  for (const f of list) {
    try {
      const content = await fs.readFile(resolveProjectPath(projectId, f.path));
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      result.push({ path: f.path, hash, updatedAt: f.updatedAt });
    } catch {
      result.push({ path: f.path, hash: null, updatedAt: f.updatedAt });
    }
  }
  return result;
}

type ClientSyncFile = {
  path: string;
  content: string;
  hash: string;
  baseHash?: string;
};

export async function syncProjectFiles(projectId: string, userId: string, clientFiles: unknown) {
  await requireProjectAccess(projectId, userId, "editor");
  if (!Array.isArray(clientFiles)) throw new HttpError("Expected array of files", 400);

  const serverFiles = await db.select().from(files).where(eq(files.projectId, projectId));
  const serverMap = new Map<string, { hash: string; updatedAt: Date }>();
  for (const sf of serverFiles) {
    try {
      const content = await fs.readFile(resolveProjectPath(projectId, sf.path));
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      serverMap.set(sf.path, { hash, updatedAt: sf.updatedAt });
    } catch {
      serverMap.set(sf.path, { hash: "", updatedAt: sf.updatedAt });
    }
  }

  const pushed: string[] = [];
  const pulled: Array<{ path: string; hash: string; content: string }> = [];
  const conflicts: Array<{
    path: string;
    baseHash?: string;
    localHash: string;
    remoteHash: string;
    localContent: string;
    remoteContent: string;
    serverUpdatedAt: Date;
  }> = [];

  for (const cf of clientFiles as ClientSyncFile[]) {
    const server = serverMap.get(cf.path);
    if (!server) {
      await writeFile(projectId, cf.path, cf.content);
      await upsertFileRecord(projectId, cf.path);
      pushed.push(cf.path);
    } else if (server.hash !== cf.hash) {
      if (cf.baseHash && cf.baseHash !== server.hash) {
        let remoteContent = "";
        try {
          remoteContent = await fs.readFile(resolveProjectPath(projectId, cf.path), "utf-8");
        } catch {
          // keep empty remote content for unreadable files
        }
        conflicts.push({
          path: cf.path,
          baseHash: cf.baseHash,
          localHash: cf.hash,
          remoteHash: server.hash,
          localContent: cf.content,
          remoteContent,
          serverUpdatedAt: server.updatedAt,
        });
      } else {
        await writeFile(projectId, cf.path, cf.content);
        await upsertFileRecord(projectId, cf.path);
        if (!cf.baseHash) {
          conflicts.push({
            path: cf.path,
            localHash: cf.hash,
            remoteHash: server.hash,
            localContent: cf.content,
            remoteContent: "",
            serverUpdatedAt: server.updatedAt,
          });
        }
        pushed.push(cf.path);
      }
    }
  }

  const clientPaths = new Set((clientFiles as ClientSyncFile[]).map(f => f.path));
  for (const [sp, info] of serverMap) {
    if (!clientPaths.has(sp)) {
      try {
        const content = await fs.readFile(resolveProjectPath(projectId, sp), "utf-8");
        pulled.push({ path: sp, hash: info.hash, content });
      } catch {
        pulled.push({ path: sp, hash: info.hash, content: "" });
      }
    }
  }

  return { pushed, pulled, conflicts };
}

export async function listProjectSnapshots(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  return listSnapshots(projectId);
}

export async function listProjectSnapshotDetails(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  return listSnapshotDetails(projectId);
}

export async function createProjectSnapshot(projectId: string, userId: string, input: { name?: string; message?: string }) {
  await requireProjectAccess(projectId, userId, "editor");
  const timestamp = await createSnapshot(projectId, {
    type: "manual",
    name: String(input.name || "Manual snapshot").trim(),
    message: String(input.message || "").trim(),
  });
  return { timestamp };
}

export async function getProjectSnapshotZip(projectId: string, userId: string, timestamp: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  return zipSnapshot(projectId, timestamp);
}

export async function readProjectSnapshotFile(projectId: string, userId: string, timestamp: string, filePath: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  if (!filePath) throw new HttpError("File path required", 400);
  return getSnapshotFile(projectId, timestamp, filePath);
}
