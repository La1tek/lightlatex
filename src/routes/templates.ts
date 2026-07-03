import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { p } from "../utils";
import { getAvailableTemplates } from "../services/templates";

const router = Router();

router.get("/", (_req: AuthRequest, res: Response) => {
  const templates = getAvailableTemplates().map(t => ({
    name: t.name,
    description: t.description,
    fileCount: t.files.length,
  }));
  res.json(templates);
});

router.get("/:name", (req: AuthRequest, res: Response) => {
  const template = getAvailableTemplates().find(t => t.name === p(req, "name"));
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json(template);
});

export default router;
