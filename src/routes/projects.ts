import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { db } from "../db";
import { projects } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { ensureProjectDir, removeProjectDir, writeFile } from "../storage/fs";
import { applyTemplate } from "./templates";
import { p } from "../utils";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req: AuthRequest, res: Response) => {
  const list = await db.select().from(projects).where(eq(projects.userId, req.userId!));
  res.json(list);
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, description, compiler, mainFile, template } = req.body;
  if (!name) return res.status(400).json({ error: "Project name required" });

  const [project] = await db.insert(projects).values({
    userId: req.userId!,
    name,
    description,
    compiler: compiler || "pdflatex",
    mainFile: mainFile || "main.tex",
  }).returning();

  await ensureProjectDir(project.id);

  if (template) {
    try {
      await applyTemplate(project.id, template);
    } catch {
      await writeFile(project.id, "main.tex", `\\documentclass{article}\n\\begin{document}\n${name}\n\\end{document}\n`);
    }
  } else {
    await writeFile(project.id, "main.tex", `\\documentclass{article}\n\\begin{document}\n${name}\n\\end{document}\n`);
  }

  res.status(201).json(project);
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const id = p(req, "id");
  const [project] = await db.select().from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, req.userId!))).limit(1);
  if (!project) return res.status(404).json({ error: "Project not found" });
  res.json(project);
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const id = p(req, "id");
  const [existing] = await db.select().from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, req.userId!))).limit(1);
  if (!existing) return res.status(404).json({ error: "Project not found" });

  const { name, description, compiler, mainFile } = req.body;
  const [updated] = await db.update(projects).set({
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description }),
    ...(compiler !== undefined && { compiler }),
    ...(mainFile !== undefined && { mainFile }),
    updatedAt: new Date(),
  }).where(eq(projects.id, id)).returning();

  res.json(updated);
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const id = p(req, "id");
  const [existing] = await db.select().from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, req.userId!))).limit(1);
  if (!existing) return res.status(404).json({ error: "Project not found" });

  await db.delete(projects).where(eq(projects.id, id));
  await removeProjectDir(id);
  res.json({ ok: true });
});

export default router;
