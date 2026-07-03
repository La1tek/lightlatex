import { Router, Response } from "express";
import multer from "multer";
import fs from "fs/promises";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { sendError } from "./http";
import {
  createAdminBackup,
  deleteAdminUser,
  getAdminHealth,
  getAdminStats,
  listAdminUsers,
  restoreAdminBackup,
} from "../services/admin";

const router = Router();
router.use(authMiddleware);

router.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAdminStats(req.userId!));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.get("/health", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getAdminHealth(req.userId!));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.get("/users", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listAdminUsers(req.userId!));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.delete("/users/:id", async (req: AuthRequest, res: Response) => {
  try {
    await deleteAdminUser(req.userId!, String(req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    sendError(res, err);
  }
});

router.post("/backup", async (req: AuthRequest, res: Response) => {
  try {
    const backup = await createAdminBackup(req.userId!);
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="lightlatex-backup-${backup.timestamp}.tar.gz"`);
    res.send(backup.content);
  } catch (err: any) {
    sendError(res, err);
  }
});

const upload = multer({ dest: "/tmp/lightlatex-uploads/", limits: { fileSize: 1024 * 1024 * 1024 } });

router.post("/restore", upload.single("backup"), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No backup file uploaded" });
    await restoreAdminBackup(req.userId!, req.file.path);
    await fs.unlink(req.file.path).catch(() => {});
    res.json({ ok: true, message: "Backup restored. Restart recommended." });
  } catch (err: any) {
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    sendError(res, err);
  }
});

export default router;
