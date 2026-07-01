import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { db } from "../db";
import { projects, files } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { readFile, writeFile, deleteFile, extractZipToProject, zipProject, ensureDir, getProjectDir, createSnapshot, listSnapshots, getSnapshotFile, renameFile } from "../storage/fs";
import { p, pw } from "../utils";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const router = Router();
router.use(authMiddleware);

async function verifyProject(projectId: string, userId: string) {
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId))).limit(1);
  if (!project) throw new Error("Project not found");
  return project;
}

// List files
router.get("/:id/files", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const list = await db.select().from(files).where(eq(files.projectId, id));
    res.json(list);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Create file
router.post("/:id/files", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).json({ error: "File path required" });

    await writeFile(id, filePath, content || "");
    const [file] = await db.insert(files).values({
      projectId: id,
      path: filePath,
    }).returning();

    res.status(201).json(file);
  } catch (err: any) {
    res.status(err.message.includes("not found") ? 404 : 400).json({ error: err.message });
  }
});

// Get file content
router.get("/:id/files/*", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const filePath = pw(req);
    if (!filePath) return res.status(400).json({ error: "File path required" });

    const fullPath = path.join(getProjectDir(id), filePath);
    if (!fullPath.startsWith(getProjectDir(id))) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    // Detect binary vs text
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    const binaryExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'pdf', 'zip']);
    if (binaryExts.has(ext)) {
      const mimeTypes: Record<string, string> = {
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf',
      };
      const content = await fs.readFile(fullPath);
      res.type(mimeTypes[ext] || 'application/octet-stream').send(content);
    } else {
      const content = await readFile(id, filePath);
      res.type("text/plain").send(content);
    }
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Update file content
router.put("/:id/files/*", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const filePath = pw(req);
    const { content } = req.body;
    if (content === undefined) return res.status(400).json({ error: "Content required" });

    await writeFile(id, filePath, content);

    const existing = await db.select().from(files)
      .where(and(eq(files.projectId, id), eq(files.path, filePath))).limit(1);

    if (existing.length > 0) {
      await db.update(files).set({ updatedAt: new Date() })
        .where(eq(files.id, existing[0].id));
    } else {
      await db.insert(files).values({ projectId: id, path: filePath });
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.message.includes("not found") ? 404 : 400).json({ error: err.message });
  }
});

// Delete file
router.delete("/:id/files/*", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const filePath = pw(req);

    await deleteFile(id, filePath);
    await db.delete(files)
      .where(and(eq(files.projectId, id), eq(files.path, filePath)));

    res.json({ ok: true });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Upload zip
const upload = multer({ dest: "/tmp/lightlatex-uploads/", limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/:id/upload", upload.single("zip"), async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    await extractZipToProject(id, req.file.path);
    await fs.unlink(req.file.path);

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Download project as zip
router.get("/:id/download", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const zipBuffer = await zipProject(id);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="project.zip"`);
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// ===== Image upload =====
const imageUpload = multer({ dest: "/tmp/lightlatex-uploads/", limits: { fileSize: 20 * 1024 * 1024 } });
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'application/pdf']);

router.post("/:id/upload-image", imageUpload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!ALLOWED_IMAGE_TYPES.has(req.file.mimetype)) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: "Unsupported file type. Allowed: png, jpg, gif, svg, pdf" });
    }

    const originalName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const imagesDir = path.join(getProjectDir(id), 'images');
    await ensureDir(imagesDir);
    const destPath = path.join(imagesDir, originalName);
    await fs.rename(req.file.path, destPath);

    // Register in DB
    const filePath = `images/${originalName}`;
    const existing = await db.select().from(files)
      .where(and(eq(files.projectId, id), eq(files.path, filePath))).limit(1);
    if (existing.length === 0) {
      await db.insert(files).values({ projectId: id, path: filePath });
    } else {
      await db.update(files).set({ updatedAt: new Date() }).where(eq(files.id, existing[0].id));
    }

    res.json({ ok: true, path: filePath, name: originalName });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// List image files
router.get("/:id/images", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const imagesDir = path.join(getProjectDir(id), 'images');
    const allFiles = await db.select().from(files).where(eq(files.projectId, id));
    const imageList = allFiles
      .filter(f => f.path.startsWith('images/'))
      .map(f => ({ path: f.path, name: f.path.replace('images/', '') }));
    res.json(imageList);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// ===== Sync API for CLI =====
// Get files with SHA256 hashes
router.get("/:id/files-with-hashes", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const list = await db.select().from(files).where(eq(files.projectId, id));
    const result = [];
    for (const f of list) {
      try {
        const content = await fs.readFile(path.join(getProjectDir(id), f.path));
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        result.push({ path: f.path, hash, updatedAt: f.updatedAt });
      } catch {
        result.push({ path: f.path, hash: null, updatedAt: f.updatedAt });
      }
    }
    res.json(result);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// Sync endpoint: accepts array of {path, content, hash}, returns diff
router.post("/:id/sync", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const clientFiles: Array<{path: string; content: string; hash: string}> = req.body;
    if (!Array.isArray(clientFiles)) return res.status(400).json({ error: "Expected array of files" });

    // Get server file hashes
    const serverFiles = await db.select().from(files).where(eq(files.projectId, id));
    const serverMap = new Map<string, { hash: string; updatedAt: Date }>();
    for (const sf of serverFiles) {
      try {
        const content = await fs.readFile(path.join(getProjectDir(id), sf.path));
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        serverMap.set(sf.path, { hash, updatedAt: sf.updatedAt });
      } catch {
        serverMap.set(sf.path, { hash: '', updatedAt: sf.updatedAt });
      }
    }

    const pushed: string[] = [];
    const pulled: Array<{path: string; hash: string}> = [];
    const conflicts: string[] = [];

    // Process client files
    for (const cf of clientFiles) {
      const server = serverMap.get(cf.path);
      if (!server) {
        // New file on client — push
        await writeFile(id, cf.path, cf.content);
        const existing = await db.select().from(files).where(and(eq(files.projectId, id), eq(files.path, cf.path))).limit(1);
        if (existing.length === 0) {
          await db.insert(files).values({ projectId: id, path: cf.path });
        } else {
          await db.update(files).set({ updatedAt: new Date() }).where(eq(files.id, existing[0].id));
        }
        pushed.push(cf.path);
      } else if (server.hash !== cf.hash) {
        // Conflict — last-write-wins: client wins (client is pushing)
        await writeFile(id, cf.path, cf.content);
        await db.update(files).set({ updatedAt: new Date() }).where(eq(files.id, (await db.select().from(files).where(and(eq(files.projectId, id), eq(files.path, cf.path))).limit(1))[0].id));
        conflicts.push(cf.path);
        pushed.push(cf.path);
      }
      // else: same hash, no action
    }

    // Find files on server not on client
    const clientPaths = new Set(clientFiles.map(f => f.path));
    for (const [sp, info] of serverMap) {
      if (!clientPaths.has(sp)) {
        try {
          const content = await fs.readFile(path.join(getProjectDir(id), sp), 'utf-8');
          pulled.push({ path: sp, hash: info.hash, content } as any);
        } catch {
          pulled.push({ path: sp, hash: info.hash, content: '' } as any);
        }
      }
    }

    res.json({ pushed, pulled, conflicts });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ===== File rename =====
router.put("/:id/files/rename", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: "oldPath and newPath required" });

    await renameFile(id, oldPath, newPath);

    // Update DB
    await db.delete(files).where(and(eq(files.projectId, id), eq(files.path, oldPath)));
    await db.insert(files).values({ projectId: id, path: newPath });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ===== Snapshots / History =====
router.get("/:id/history", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const snapshots = await listSnapshots(id);
    res.json(snapshots);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.get("/:id/history/:timestamp/files/*", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await verifyProject(id, req.userId!);
    const timestamp = String(req.params.timestamp);
    const filePath = pw(req);
    if (!filePath) return res.status(400).json({ error: "File path required" });

    const content = await getSnapshotFile(id, timestamp, filePath);
    res.type("text/plain").send(content);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
