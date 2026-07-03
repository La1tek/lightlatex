import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { p } from "../utils";
import fs from "fs";
import fsPromises from "fs/promises";
import { ProjectAccessError, requireProjectAccess } from "../auth/projectAccess";
import { sendError } from "./http";
import {
  cancelCompileJob,
  getCompileJob,
  listCompileJobs,
  retryCompileJob,
  runTrackedCompile,
} from "../services/compileJobs";

const router = Router();
router.use(authMiddleware);

const PROJECTS_DIR = process.env.PROJECTS_DIR || "./data/projects";

router.post("/:id/compile", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    res.json(await runTrackedCompile(id, req.userId!));
  } catch (err: any) {
    sendError(res, err, 500);
  }
});

router.get("/:id/compile/jobs", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listCompileJobs(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err, 500);
  }
});

router.get("/:id/compile/jobs/:jobId", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getCompileJob(p(req, "id"), req.userId!, String(req.params.jobId)));
  } catch (err: any) {
    sendError(res, err, 500);
  }
});

router.post("/:id/compile/jobs/:jobId/cancel", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await cancelCompileJob(p(req, "id"), req.userId!, String(req.params.jobId)));
  } catch (err: any) {
    sendError(res, err, 500);
  }
});

router.post("/:id/compile/jobs/:jobId/retry", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await retryCompileJob(p(req, "id"), req.userId!, String(req.params.jobId)));
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
