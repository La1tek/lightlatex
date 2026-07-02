import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { projectCollaborators, projects } from "../db/schema";

export type ProjectAccessRole = "owner" | "editor" | "viewer";

export class ProjectAccessError extends Error {
  status: number;

  constructor(message = "Project not found", status = 404) {
    super(message);
    this.name = "ProjectAccessError";
    this.status = status;
  }
}

const ROLE_RANK: Record<ProjectAccessRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

function normalizeRole(role: string | null | undefined): ProjectAccessRole {
  return role === "editor" ? "editor" : role === "owner" ? "owner" : "viewer";
}

export function canAccess(role: ProjectAccessRole, required: ProjectAccessRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export async function getProjectAccess(projectId: string, userId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new ProjectAccessError();

  if (project.userId === userId) {
    return { project, role: "owner" as ProjectAccessRole };
  }

  const [collaboration] = await db.select().from(projectCollaborators)
    .where(and(eq(projectCollaborators.projectId, projectId), eq(projectCollaborators.userId, userId)))
    .limit(1);

  if (!collaboration) throw new ProjectAccessError();
  return { project, role: normalizeRole(collaboration.role) };
}

export async function requireProjectAccess(projectId: string, userId: string, required: ProjectAccessRole = "viewer") {
  const access = await getProjectAccess(projectId, userId);
  if (!canAccess(access.role, required)) {
    throw new ProjectAccessError("Insufficient project permissions", 403);
  }
  return access;
}
