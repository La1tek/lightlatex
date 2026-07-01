import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { db } from "../db";
import { projects } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { compileProject } from "../compiler/engine";
import { p } from "../utils";
import fs from "fs";
import fsPromises from "fs/promises";

const router = Router();
router.use(authMiddleware);

const PROJECTS_DIR = process.env.PROJECTS_DIR || "./data/projects";

router.post("/:id/compile", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, req.userId!))).limit(1);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const result = await compileProject(project.id, project.mainFile || "main.tex", project.compiler || "pdflatex");
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/output.pdf", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, req.userId!))).limit(1);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const pdfPath = PROJECTS_DIR + "/" + project.id + "/output.pdf";
    const exists = await fsPromises.access(pdfPath).then(() => true).catch(() => false);
    if (!exists) return res.status(404).json({ error: "PDF not found. Compile first." });

    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(pdfPath);
    stream.pipe(res);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

export default router;
