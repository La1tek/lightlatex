import { and, asc, eq } from "drizzle-orm";
import { requireProjectAccess } from "../auth/projectAccess";
import { db } from "../db";
import { projectCollaborators, users } from "../db/schema";
import { HttpError } from "../shared/errors";
import { validateCollaboratorRole } from "../shared/validation";

export async function listProjectCollaborators(projectId: string, userId: string) {
  const access = await requireProjectAccess(projectId, userId, "owner");
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
    .where(eq(projectCollaborators.projectId, projectId))
    .orderBy(asc(users.email));

  return {
    owner: owner ? { ...owner, role: "owner" } : null,
    collaborators,
  };
}

export async function upsertProjectCollaborator(projectId: string, ownerUserId: string, input: { email?: string; role?: unknown }) {
  const access = await requireProjectAccess(projectId, ownerUserId, "owner");
  const email = String(input.email || "").trim().toLowerCase();
  if (!email) throw new HttpError("Email required", 400);
  const role = validateCollaboratorRole(input.role);

  const [targetUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!targetUser) throw new HttpError("User not found", 404);
  if (targetUser.id === access.project.userId) {
    throw new HttpError("Project owner already has owner access", 400);
  }

  const [existing] = await db.select().from(projectCollaborators)
    .where(and(eq(projectCollaborators.projectId, projectId), eq(projectCollaborators.userId, targetUser.id)))
    .limit(1);

  const [collaborator] = existing
    ? await db.update(projectCollaborators)
      .set({ role, updatedAt: new Date() })
      .where(eq(projectCollaborators.id, existing.id))
      .returning()
    : await db.insert(projectCollaborators)
      .values({ projectId, userId: targetUser.id, role })
      .returning();

  return {
    status: existing ? 200 : 201,
    collaborator: {
      id: collaborator.id,
      userId: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: collaborator.role,
      createdAt: collaborator.createdAt,
      updatedAt: collaborator.updatedAt,
    },
  };
}

export async function updateProjectCollaborator(projectId: string, ownerUserId: string, collaboratorId: string, input: { role?: unknown }) {
  await requireProjectAccess(projectId, ownerUserId, "owner");
  const role = validateCollaboratorRole(input.role);
  const [updated] = await db.update(projectCollaborators)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(projectCollaborators.id, collaboratorId), eq(projectCollaborators.projectId, projectId)))
    .returning();
  if (!updated) throw new HttpError("Collaborator not found", 404);
  return updated;
}

export async function removeProjectCollaborator(projectId: string, ownerUserId: string, collaboratorId: string) {
  await requireProjectAccess(projectId, ownerUserId, "owner");
  await db.delete(projectCollaborators)
    .where(and(eq(projectCollaborators.id, collaboratorId), eq(projectCollaborators.projectId, projectId)));
}
