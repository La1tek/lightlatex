import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, users } from "../db/schema";

export interface AuditEventInput {
  userId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(input: AuditEventInput) {
  try {
    await db.insert(auditLogs).values({
      userId: input.userId || null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 8000) : null,
    });
  } catch {
    // Audit is operational metadata; never fail the user action because logging failed.
  }
}

export async function listAuditEvents(limit = 100) {
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  return db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    resourceType: auditLogs.resourceType,
    resourceId: auditLogs.resourceId,
    metadata: auditLogs.metadata,
    createdAt: auditLogs.createdAt,
    userId: auditLogs.userId,
    userEmail: users.email,
  })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(safeLimit);
}
