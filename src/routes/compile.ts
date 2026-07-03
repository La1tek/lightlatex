import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { compileProject } from "../compiler/engine";
import { p } from "../utils";
import fs from "fs";
import fsPromises from "fs/promises";
import { createSnapshot } from "../storage/fs";
import { ProjectAccessError, requireProjectAccess } from "../auth/projectAccess";
import { sendError } from "./http";

const router = Router();
router.use(authMiddleware);

const PROJECTS_DIR = process.env.PROJECTS_DIR || "./data/projects";

router.post("/:id/compile", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    const { project } = await requireProjectAccess(id, req.userId!, "editor");

    const result = await compileProject(project.id, project.mainFile || "main.tex", project.compiler || "pdflatex");

    // Create snapshot on compile
    if (result.success) {
      try { await createSnapshot(project.id); } catch { /* snapshot best-effort */ }
    }

    res.json(result);
  } catch (err: any) {
    sendError(res, err, 500);
  }
});

router.get("/:id/output.pdf", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    const { project } = await requireProjectAccess(id, req.userId!, "viewer");

    const pdfPath = PROJECTS_DIR + "/" + project.id + "/output.pdf";
    const exists = await fsPromises.access(pdfPath).then(() => true).catch(() => false);
    if (!exists) return res.status(404).json({ error: "PDF not found. Compile first." });

    res.setHeader("Content-Type", "application/pdf");
    const stream = fs.createReadStream(pdfPath);
    stream.pipe(res);
  } catch (err: any) {
    res.status(err instanceof ProjectAccessError ? err.status : 404).json({ error: err.message });
  }
});

export default router;
