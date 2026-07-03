import { Router, Response } from "express";
import multer from "multer";
import fs from "fs/promises";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { config } from "../config";
import { p, pw } from "../utils";
import { sendError } from "./http";
import {
  createProjectFile,
  createProjectSnapshot,
  deleteProjectFile,
  getProjectFile,
  getProjectSnapshotZip,
  getProjectZip,
  importProjectZip,
  listProjectAssets,
  listProjectFiles,
  listProjectFilesWithHashes,
  listProjectSnapshotDetails,
  listProjectSnapshots,
  readProjectSnapshotFile,
  renameProjectFile,
  syncProjectFiles,
  updateProjectFile,
  uploadProjectAsset,
} from "../services/files";

const router = Router();
router.use(authMiddleware);

const upload = multer({ dest: "/tmp/lightlatex-uploads/", limits: { fileSize: config.upload.maxZipBytes } });
const imageUpload = multer({ dest: "/tmp/lightlatex-uploads/", limits: { fileSize: config.upload.maxImageBytes } });

router.get("/:id/files", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listProjectFiles(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.post("/:id/files", async (req: AuthRequest, res: Response) => {
  try {
    const file = await createProjectFile(p(req, "id"), req.userId!, req.body);
    res.status(201).json(file);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.get("/:id/files/*", async (req: AuthRequest, res: Response) => {
  try {
    const result = await getProjectFile(p(req, "id"), req.userId!, pw(req));
    res.type(result.type).send(result.content);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.put("/:id/files/rename", async (req: AuthRequest, res: Response) => {
  try {
    await renameProjectFile(p(req, "id"), req.userId!, req.body);
    res.json({ ok: true });
  } catch (err: any) {
    sendError(res, err);
  }
});

router.put("/:id/files/*", async (req: AuthRequest, res: Response) => {
  try {
    await updateProjectFile(p(req, "id"), req.userId!, pw(req), req.body.content);
    res.json({ ok: true });
  } catch (err: any) {
    sendError(res, err);
  }
});

router.delete("/:id/files/*", async (req: AuthRequest, res: Response) => {
  try {
    await deleteProjectFile(p(req, "id"), req.userId!, pw(req));
    res.json({ ok: true });
  } catch (err: any) {
    sendError(res, err);
  }
});

router.post("/:id/upload", upload.single("zip"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    await importProjectZip(p(req, "id"), req.userId!, req.file.path);
    await fs.unlink(req.file.path);
    res.json({ ok: true });
  } catch (err: any) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    sendError(res, err);
  }
});

router.get("/:id/download", async (req: AuthRequest, res: Response) => {
  try {
    const zipBuffer = await getProjectZip(p(req, "id"), req.userId!);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="project.zip"');
    res.send(zipBuffer);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.post("/:id/upload-image", imageUpload.single("image"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json(await uploadProjectAsset(p(req, "id"), req.userId!, req.file));
  } catch (err: any) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    sendError(res, err);
  }
});

router.get("/:id/images", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listProjectAssets(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.get("/:id/files-with-hashes", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listProjectFilesWithHashes(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.post("/:id/sync", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await syncProjectFiles(p(req, "id"), req.userId!, req.body));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.get("/:id/history", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listProjectSnapshots(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.get("/:id/history/details", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listProjectSnapshotDetails(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.post("/:id/history", async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await createProjectSnapshot(p(req, "id"), req.userId!, req.body || {});
    res.status(201).json(snapshot);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.get("/:id/history/:timestamp/download", async (req: AuthRequest, res: Response) => {
  try {
    const timestamp = String(req.params.timestamp);
    const zipBuffer = await getProjectSnapshotZip(p(req, "id"), req.userId!, timestamp);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="snapshot-${timestamp}.zip"`);
    res.send(zipBuffer);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.get("/:id/history/:timestamp/files/*", async (req: AuthRequest, res: Response) => {
  try {
    const content = await readProjectSnapshotFile(p(req, "id"), req.userId!, String(req.params.timestamp), pw(req));
    res.type("text/plain").send(content);
  } catch (err: any) {
    sendError(res, err);
  }
});

export default router;
