import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { requireProjectAccess } from "../auth/projectAccess";
import { db } from "../db";
import { projectCliTokens } from "../db/schema";
import { HttpError } from "../shared/errors";
import { sha256 } from "../shared/hash";

const TOKEN_PREFIX = "ltx_";

function hashToken(token: string) {
  return sha256(token);
}

function createToken() {
  return `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

export async function getProjectCliToken(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "owner");
  const [token] = await db.select({
    id: projectCliTokens.id,
    tokenPrefix: projectCliTokens.tokenPrefix,
    createdAt: projectCliTokens.createdAt,
    lastUsedAt: projectCliTokens.lastUsedAt,
  }).from(projectCliTokens)
    .where(and(eq(projectCliTokens.projectId, projectId), eq(projectCliTokens.userId, userId)))
    .limit(1);
  return token || null;
}

export async function regenerateProjectCliToken(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "owner");
  await db.delete(projectCliTokens)
    .where(and(eq(projectCliTokens.projectId, projectId), eq(projectCliTokens.userId, userId)));

  const token = createToken();
  const tokenPrefix = token.slice(0, 12);
  const [record] = await db.insert(projectCliTokens).values({
    projectId,
    userId,
    tokenHash: hashToken(token),
    tokenPrefix,
  }).returning({
    id: projectCliTokens.id,
    tokenPrefix: projectCliTokens.tokenPrefix,
    createdAt: projectCliTokens.createdAt,
    lastUsedAt: projectCliTokens.lastUsedAt,
  });

  return { ...record, token };
}

export async function revokeProjectCliToken(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "owner");
  await db.delete(projectCliTokens)
    .where(and(eq(projectCliTokens.projectId, projectId), eq(projectCliTokens.userId, userId)));
}

export async function authenticateCliToken(token: string) {
  if (!token.startsWith(TOKEN_PREFIX)) throw new HttpError("Invalid CLI token", 401);
  const [record] = await db.select().from(projectCliTokens)
    .where(eq(projectCliTokens.tokenHash, hashToken(token)))
    .limit(1);
  if (!record) throw new HttpError("Invalid CLI token", 401);
  await db.update(projectCliTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(projectCliTokens.id, record.id));
  return { userId: record.userId, projectId: record.projectId };
}
