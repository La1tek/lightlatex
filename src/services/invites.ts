import crypto from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { requireProjectAccess } from "../auth/projectAccess";
import { db } from "../db";
import { projectCollaborators, projectInvites, projects } from "../db/schema";
import { CollaboratorRole } from "../shared/constants";
import { HttpError } from "../shared/errors";
import { sha256 } from "../shared/hash";
import { validateCollaboratorRole } from "../shared/validation";

const INVITE_PREFIX = "lti_";

function createInviteToken() {
  return `${INVITE_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

function hashToken(token: string) {
  return sha256(token);
}

function normalizeMaxUses(value: unknown) {
  const maxUses = value === undefined ? 25 : Number(value);
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 500) {
    throw new HttpError("maxUses must be between 1 and 500", 400);
  }
  return maxUses;
}

function normalizeExpiresInDays(value: unknown) {
  const days = value === undefined ? 14 : Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new HttpError("expiresInDays must be between 1 and 365", 400);
  }
  return days;
}

function strongerRole(existing: string, invited: CollaboratorRole): CollaboratorRole {
  if (existing === "editor" || invited === "editor") return "editor";
  return "viewer";
}

export async function listProjectInvites(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "owner");
  return db.select({
    id: projectInvites.id,
    role: projectInvites.role,
    tokenPrefix: projectInvites.tokenPrefix,
    maxUses: projectInvites.maxUses,
    useCount: projectInvites.useCount,
    expiresAt: projectInvites.expiresAt,
    revokedAt: projectInvites.revokedAt,
    createdAt: projectInvites.createdAt,
  })
    .from(projectInvites)
    .where(eq(projectInvites.projectId, projectId))
    .orderBy(asc(projectInvites.createdAt));
}

export async function createProjectInvite(projectId: string, userId: string, input: { role?: unknown; maxUses?: unknown; expiresInDays?: unknown }) {
  await requireProjectAccess(projectId, userId, "owner");
  const role = validateCollaboratorRole(input.role);
  const maxUses = normalizeMaxUses(input.maxUses);
  const expiresAt = new Date(Date.now() + normalizeExpiresInDays(input.expiresInDays) * 24 * 60 * 60 * 1000);
  const token = createInviteToken();
  const [invite] = await db.insert(projectInvites).values({
    projectId,
    createdBy: userId,
    role,
    maxUses,
    expiresAt,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, 12),
  }).returning({
    id: projectInvites.id,
    role: projectInvites.role,
    tokenPrefix: projectInvites.tokenPrefix,
    maxUses: projectInvites.maxUses,
    useCount: projectInvites.useCount,
    expiresAt: projectInvites.expiresAt,
    revokedAt: projectInvites.revokedAt,
    createdAt: projectInvites.createdAt,
  });
  return { ...invite, token };
}

export async function revokeProjectInvite(projectId: string, userId: string, inviteId: string) {
  await requireProjectAccess(projectId, userId, "owner");
  const [updated] = await db.update(projectInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(projectInvites.id, inviteId), eq(projectInvites.projectId, projectId)))
    .returning();
  if (!updated) throw new HttpError("Invite not found", 404);
  return updated;
}

export async function acceptProjectInvite(token: string, userId: string) {
  if (!token.startsWith(INVITE_PREFIX)) throw new HttpError("Invalid invite token", 400);
  const [invite] = await db.select().from(projectInvites)
    .where(eq(projectInvites.tokenHash, hashToken(token)))
    .limit(1);
  if (!invite) throw new HttpError("Invite not found", 404);
  if (invite.revokedAt) throw new HttpError("Invite has been revoked", 410);
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) throw new HttpError("Invite has expired", 410);
  if (invite.useCount >= invite.maxUses) throw new HttpError("Invite use limit reached", 410);

  const [project] = await db.select().from(projects).where(eq(projects.id, invite.projectId)).limit(1);
  if (!project) throw new HttpError("Project not found", 404);
  if (project.userId !== userId) {
    const [existing] = await db.select().from(projectCollaborators)
      .where(and(eq(projectCollaborators.projectId, invite.projectId), eq(projectCollaborators.userId, userId)))
      .limit(1);
    const nextRole = existing ? strongerRole(existing.role, invite.role as CollaboratorRole) : invite.role;
    if (existing) {
      await db.update(projectCollaborators)
        .set({ role: nextRole, updatedAt: new Date() })
        .where(eq(projectCollaborators.id, existing.id));
    } else {
      await db.insert(projectCollaborators).values({
        projectId: invite.projectId,
        userId,
        role: nextRole,
      });
    }
  }

  await db.update(projectInvites)
    .set({ useCount: invite.useCount + 1 })
    .where(eq(projectInvites.id, invite.id));

  return {
    projectId: invite.projectId,
    role: project.userId === userId ? "owner" : invite.role,
  };
}
