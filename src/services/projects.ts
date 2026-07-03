import { eq } from "drizzle-orm";
import { db } from "../db";
import { files, projectCollaborators, projects, users } from "../db/schema";
import { requireProjectAccess } from "../auth/projectAccess";
import { ensureProjectDir, readFile, removeProjectDir, writeFile } from "../storage/fs";
import { syncFileRecords } from "../storage/fileRegistry";
import { applyTemplate } from "./templates";
import { BINARY_FILE_EXTENSIONS } from "../shared/constants";
import { getCompiler, isSafeMainFile } from "../shared/validation";
import { HttpError } from "../shared/errors";

interface ProjectInput {
  name?: string;
  description?: string;
  compiler?: unknown;
  mainFile?: unknown;
  template?: string;
}

interface ProjectUpdateInput {
  name?: string;
  description?: string;
  compiler?: unknown;
  mainFile?: unknown;
}

function defaultMainTex(name: string): string {
  return `\\documentclass{article}\n\\begin{document}\n${name}\n\\end{document}\n`;
}

export async function listProjectsForUser(userId: string) {
  const owned = await db.select().from(projects).where(eq(projects.userId, userId));
  const sharedRows = await db.select({
    project: projects,
    role: projectCollaborators.role,
    ownerEmail: users.email,
    ownerName: users.name,
  })
    .from(projectCollaborators)
    .innerJoin(projects, eq(projectCollaborators.projectId, projects.id))
    .innerJoin(users, eq(projects.userId, users.id))
    .where(eq(projectCollaborators.userId, userId));

  return [
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
}

export async function createProjectForUser(userId: string, input: ProjectInput) {
  const { name, description, compiler, mainFile, template } = input;
  if (!name) throw new HttpError("Project name required", 400);
  const selectedCompiler = getCompiler(compiler);
  if (mainFile !== undefined && !isSafeMainFile(mainFile)) {
    throw new HttpError("Invalid main file path", 400);
  }

  const [project] = await db.insert(projects).values({
    userId,
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
      await writeFile(project.id, "main.tex", defaultMainTex(name));
    }
  } else {
    await writeFile(project.id, "main.tex", defaultMainTex(name));
  }
  await syncFileRecords(project.id);

  return project;
}

export async function getProjectForUser(projectId: string, userId: string) {
  const access = await requireProjectAccess(projectId, userId, "viewer");
  const [owner] = await db.select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, access.project.userId))
    .limit(1);
  return {
    ...access.project,
    accessRole: access.role,
    ownerEmail: owner?.email || null,
    ownerName: owner?.name || null,
  };
}

export async function updateProjectForOwner(projectId: string, userId: string, input: ProjectUpdateInput) {
  await requireProjectAccess(projectId, userId, "owner");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.compiler !== undefined) updates.compiler = getCompiler(input.compiler);
  if (input.mainFile !== undefined) {
    if (!isSafeMainFile(input.mainFile)) throw new HttpError("Invalid main file path", 400);
    updates.mainFile = input.mainFile;
  }

  const [updated] = await db.update(projects).set(updates).where(eq(projects.id, projectId)).returning();
  return updated;
}

export async function deleteProjectForOwner(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "owner");
  await db.delete(projects).where(eq(projects.id, projectId));
  await removeProjectDir(projectId);
}

export async function searchProjectFiles(projectId: string, userId: string, query: string) {
  const q = query.trim();
  if (!q) throw new HttpError("Query required", 400);

  await requireProjectAccess(projectId, userId, "viewer");

  const fileList = await db.select().from(files).where(eq(files.projectId, projectId));
  const results: Array<{ file: string; line: number; content: string }> = [];

  for (const file of fileList) {
    const ext = file.path.split(".").pop()?.toLowerCase();
    if (BINARY_FILE_EXTENSIONS.has(ext || "")) continue;

    try {
      const content = await readFile(projectId, file.path);
      const lines = content.split("\n");
      const lowerQ = q.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQ)) {
          results.push({ file: file.path, line: i + 1, content: lines[i].trim() });
          if (results.length >= 200) break;
        }
      }
      if (results.length >= 200) break;
    } catch {
      // Skip unreadable files.
    }
  }

  return results;
}
