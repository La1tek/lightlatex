import { and, asc, eq } from "drizzle-orm";
import { ProjectAccessRole, requireProjectAccess } from "../auth/projectAccess";
import { db } from "../db";
import { projectComments, users } from "../db/schema";
import { HttpError } from "../shared/errors";
import { isSafeProjectRelativePath } from "../shared/validation";

function normalizeCommentBody(value: unknown) {
  const body = String(value || "").trim();
  if (!body) throw new HttpError("Comment body required", 400);
  if (body.length > 4000) throw new HttpError("Comment is too long", 400);
  return body;
}

function normalizeFilePath(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (!isSafeProjectRelativePath(value)) throw new HttpError("Invalid comment file path", 400);
  return value;
}

function normalizeLineNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const line = Number(value);
  if (!Number.isInteger(line) || line < 1 || line > 1_000_000) {
    throw new HttpError("Invalid comment line number", 400);
  }
  return line;
}

function canModerate(role: ProjectAccessRole) {
  return role === "owner" || role === "editor";
}

async function getCommentForProject(projectId: string, commentId: string) {
  const [comment] = await db.select().from(projectComments)
    .where(and(eq(projectComments.id, commentId), eq(projectComments.projectId, projectId)))
    .limit(1);
  if (!comment) throw new HttpError("Comment not found", 404);
  return comment;
}

export async function listProjectComments(projectId: string, userId: string, options: { filePath?: unknown; includeResolved?: unknown } = {}) {
  await requireProjectAccess(projectId, userId, "viewer");
  const requestedFile = normalizeFilePath(options.filePath);
  const includeResolved = options.includeResolved === true || options.includeResolved === "true";

  const rows = await db.select({
    id: projectComments.id,
    projectId: projectComments.projectId,
    filePath: projectComments.filePath,
    lineNumber: projectComments.lineNumber,
    body: projectComments.body,
    resolved: projectComments.resolved,
    resolvedAt: projectComments.resolvedAt,
    createdAt: projectComments.createdAt,
    updatedAt: projectComments.updatedAt,
    authorId: users.id,
    authorEmail: users.email,
    authorName: users.name,
  })
    .from(projectComments)
    .innerJoin(users, eq(projectComments.authorId, users.id))
    .where(eq(projectComments.projectId, projectId))
    .orderBy(asc(projectComments.createdAt));

  return rows.filter((row) => {
    if (requestedFile && row.filePath !== requestedFile) return false;
    if (!includeResolved && row.resolved) return false;
    return true;
  });
}

export async function createProjectComment(projectId: string, userId: string, input: { filePath?: unknown; lineNumber?: unknown; body?: unknown }) {
  await requireProjectAccess(projectId, userId, "viewer");
  const [comment] = await db.insert(projectComments).values({
    projectId,
    authorId: userId,
    filePath: normalizeFilePath(input.filePath),
    lineNumber: normalizeLineNumber(input.lineNumber),
    body: normalizeCommentBody(input.body),
  }).returning();
  return comment;
}

export async function updateProjectComment(projectId: string, userId: string, commentId: string, input: { body?: unknown }) {
  const access = await requireProjectAccess(projectId, userId, "viewer");
  const comment = await getCommentForProject(projectId, commentId);
  if (comment.authorId !== userId && access.role !== "owner") {
    throw new HttpError("Only the author or owner can edit this comment", 403);
  }
  const [updated] = await db.update(projectComments)
    .set({ body: normalizeCommentBody(input.body), updatedAt: new Date() })
    .where(and(eq(projectComments.id, commentId), eq(projectComments.projectId, projectId)))
    .returning();
  return updated;
}

export async function resolveProjectComment(projectId: string, userId: string, commentId: string, resolved: boolean) {
  const access = await requireProjectAccess(projectId, userId, "viewer");
  const comment = await getCommentForProject(projectId, commentId);
  if (comment.authorId !== userId && !canModerate(access.role)) {
    throw new HttpError("Only the author, editor, or owner can resolve this comment", 403);
  }
  const now = new Date();
  const [updated] = await db.update(projectComments)
    .set({
      resolved,
      resolvedAt: resolved ? now : null,
      updatedAt: now,
    })
    .where(and(eq(projectComments.id, commentId), eq(projectComments.projectId, projectId)))
    .returning();
  return updated;
}

export async function deleteProjectComment(projectId: string, userId: string, commentId: string) {
  const access = await requireProjectAccess(projectId, userId, "viewer");
  const comment = await getCommentForProject(projectId, commentId);
  if (comment.authorId !== userId && access.role !== "owner") {
    throw new HttpError("Only the author or owner can delete this comment", 403);
  }
  await db.delete(projectComments)
    .where(and(eq(projectComments.id, commentId), eq(projectComments.projectId, projectId)));
}
