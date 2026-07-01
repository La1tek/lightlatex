import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { db } from "../db";
import { projects, files } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { readFile, writeFile, deleteFile, extractZipToProject, zipProject } from "../storage/fs";
import { p, pw } from "../utils";
import multer from "multer";
import fs from "fs/promises";

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

    const content = await readFile(id, filePath);
    res.type("text/plain").send(content);
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

export default router;
