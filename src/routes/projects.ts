import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { db } from "../db";
import { projects, files, projectCollaborators, users } from "../db/schema";
import { eq, and, asc } from "drizzle-orm";
import { ensureProjectDir, removeProjectDir, writeFile, readFile } from "../storage/fs";
import { syncFileRecords } from "../storage/fileRegistry";
import { ProjectAccessError, requireProjectAccess } from "../auth/projectAccess";
import { applyTemplate } from "./templates";
import { p } from "../utils";

const router = Router();
const ALLOWED_COMPILERS = new Set(["pdflatex", "xelatex", "lualatex"]);
const COLLABORATOR_ROLES = new Set(["viewer", "editor"]);
router.use(authMiddleware);

function getCompiler(value: unknown): string {
  const compiler = typeof value === "string" && value.trim() ? value.trim() : "pdflatex";
  if (!ALLOWED_COMPILERS.has(compiler)) {
    throw new Error("Unsupported compiler");
  }
  return compiler;
}

function isSafeMainFile(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.endsWith(".tex")
    && !value.startsWith("/")
    && !value.split(/[\\/]+/).includes("..");
}

function accessError(res: Response, err: any) {
  const status = err instanceof ProjectAccessError ? err.status : 404;
  res.status(status).json({ error: err.message || "Project not found" });
}

function validateCollaboratorRole(value: unknown): "viewer" | "editor" {
  const role = typeof value === "string" ? value.trim() : "viewer";
  if (!COLLABORATOR_ROLES.has(role)) {
    throw new Error("Role must be viewer or editor");
  }
  return role as "viewer" | "editor";
}

router.get("/", async (req: AuthRequest, res: Response) => {
  const owned = await db.select().from(projects).where(eq(projects.userId, req.userId!));
  const sharedRows = await db.select({
    project: projects,
    role: projectCollaborators.role,
    ownerEmail: users.email,
    ownerName: users.name,
  })
    .from(projectCollaborators)
    .innerJoin(projects, eq(projectCollaborators.projectId, projects.id))
    .innerJoin(users, eq(projects.userId, users.id))
    .where(eq(projectCollaborators.userId, req.userId!));

  const list = [
    ...owned.map((project) => ({
      ...project,
      accessRole: "owner",
      ownerEmail: null,
      ownerName: null,
    })),
    ...sharedRows.map((row) => ({
      ...row.project,
      accessRole: row.role,
      ownerEmail: row.ownerEmail,
      ownerName: row.ownerName,
    })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  res.json(list);
});

router.post("/", async (req: AuthRequest, res: Response) => {
  const { name, description, compiler, mainFile, template } = req.body;
  if (!name) return res.status(400).json({ error: "Project name required" });
  let selectedCompiler: string;
  try {
    selectedCompiler = getCompiler(compiler);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
  if (mainFile !== undefined && !isSafeMainFile(mainFile)) {
    return res.status(400).json({ error: "Invalid main file path" });
  }

  const [project] = await db.insert(projects).values({
    userId: req.userId!,
    name,
    description,
    compiler: selectedCompiler,
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
  await syncFileRecords(project.id);

  res.status(201).json(project);
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    const access = await requireProjectAccess(id, req.userId!, "viewer");
    const [owner] = await db.select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, access.project.userId))
      .limit(1);
    res.json({
      ...access.project,
      accessRole: access.role,
      ownerEmail: owner?.email || null,
      ownerName: owner?.name || null,
    });
  } catch (err: any) {
    accessError(res, err);
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  const id = p(req, "id");
  try {
    await requireProjectAccess(id, req.userId!, "owner");
  } catch (err: any) {
    return accessError(res, err);
  }

  const { name, description, compiler, mainFile } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (compiler !== undefined) {
    try {
      updates.compiler = getCompiler(compiler);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }
  if (mainFile !== undefined) {
    if (!isSafeMainFile(mainFile)) return res.status(400).json({ error: "Invalid main file path" });
    updates.mainFile = mainFile;
  }

  const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();

  res.json(updated);
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  const id = p(req, "id");
  try {
    await requireProjectAccess(id, req.userId!, "owner");
  } catch (err: any) {
    return accessError(res, err);
  }

  await db.delete(projects).where(eq(projects.id, id));
  await removeProjectDir(id);
  res.json({ ok: true });
});

// Project collaborators
router.get("/:id/collaborators", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    const access = await requireProjectAccess(id, req.userId!, "owner");
    const [owner] = await db.select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, access.project.userId))
      .limit(1);
    const collaborators = await db.select({
      id: projectCollaborators.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: projectCollaborators.role,
      createdAt: projectCollaborators.createdAt,
      updatedAt: projectCollaborators.updatedAt,
    })
      .from(projectCollaborators)
      .innerJoin(users, eq(projectCollaborators.userId, users.id))
      .where(eq(projectCollaborators.projectId, id))
      .orderBy(asc(users.email));

    res.json({
      owner: owner ? { ...owner, role: "owner" } : null,
      collaborators,
    });
  } catch (err: any) {
    accessError(res, err);
  }
});

router.post("/:id/collaborators", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    const access = await requireProjectAccess(id, req.userId!, "owner");
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email required" });
    const role = validateCollaboratorRole(req.body?.role);

    const [targetUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!targetUser) return res.status(404).json({ error: "User not found" });
    if (targetUser.id === access.project.userId) {
      return res.status(400).json({ error: "Project owner already has owner access" });
    }

    const [existing] = await db.select().from(projectCollaborators)
      .where(and(eq(projectCollaborators.projectId, id), eq(projectCollaborators.userId, targetUser.id)))
      .limit(1);

    const [collaborator] = existing
      ? await db.update(projectCollaborators)
        .set({ role, updatedAt: new Date() })
        .where(eq(projectCollaborators.id, existing.id))
        .returning()
      : await db.insert(projectCollaborators)
        .values({ projectId: id, userId: targetUser.id, role })
        .returning();

    res.status(existing ? 200 : 201).json({
      id: collaborator.id,
      userId: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: collaborator.role,
      createdAt: collaborator.createdAt,
      updatedAt: collaborator.updatedAt,
    });
  } catch (err: any) {
    if (err instanceof ProjectAccessError) return accessError(res, err);
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id/collaborators/:collaboratorId", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await requireProjectAccess(id, req.userId!, "owner");
    const collaboratorId = String(req.params.collaboratorId);
    const role = validateCollaboratorRole(req.body?.role);
    const [updated] = await db.update(projectCollaborators)
      .set({ role, updatedAt: new Date() })
      .where(and(eq(projectCollaborators.id, collaboratorId), eq(projectCollaborators.projectId, id)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Collaborator not found" });
    res.json(updated);
  } catch (err: any) {
    if (err instanceof ProjectAccessError) return accessError(res, err);
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id/collaborators/:collaboratorId", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    await requireProjectAccess(id, req.userId!, "owner");
    const collaboratorId = String(req.params.collaboratorId);
    await db.delete(projectCollaborators)
      .where(and(eq(projectCollaborators.id, collaboratorId), eq(projectCollaborators.projectId, id)));
    res.json({ ok: true });
  } catch (err: any) {
    accessError(res, err);
  }
});

// Cross-file search
router.get("/:id/search", async (req: AuthRequest, res: Response) => {
  try {
    const id = p(req, "id");
    const q = (req.query.q as string || "").trim();
    if (!q) return res.status(400).json({ error: "Query required" });

    await requireProjectAccess(id, req.userId!, "viewer");

    const fileList = await db.select().from(files).where(eq(files.projectId, id));
    const results: Array<{ file: string; line: number; content: string }> = [];

    for (const f of fileList) {
      const ext = f.path.split(".").pop()?.toLowerCase();
      if (["png", "jpg", "jpeg", "gif", "svg", "pdf", "zip"].includes(ext || "")) continue;

      try {
        const content = await readFile(id, f.path);
        const lines = content.split("\n");
        const lowerQ = q.toLowerCase();
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lowerQ)) {
            results.push({ file: f.path, line: i + 1, content: lines[i].trim() });
            if (results.length >= 200) break;
          }
        }
        if (results.length >= 200) break;
      } catch { /* skip unreadable */ }
    }

    res.json(results);
  } catch (err: any) {
    accessError(res, err);
  }
});

export default router;
