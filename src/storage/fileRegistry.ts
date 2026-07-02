import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { files } from "../db/schema";
import { listFiles } from "./fs";

export async function upsertFileRecord(projectId: string, filePath: string) {
  const [existing] = await db.select().from(files)
    .where(and(eq(files.projectId, projectId), eq(files.path, filePath))).limit(1);

  if (existing) {
    const [updated] = await db.update(files)
      .set({ updatedAt: new Date() })
      .where(eq(files.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(files).values({ projectId, path: filePath }).returning();
  return created;
}

export async function syncFileRecords(projectId: string): Promise<string[]> {
  const diskPaths = await listFiles(projectId);
  const diskPathSet = new Set(diskPaths);
  const existing = await db.select().from(files).where(eq(files.projectId, projectId));
  const existingPathSet = new Set(existing.map((file) => file.path));

  for (const filePath of diskPaths) {
    if (!existingPathSet.has(filePath)) {
      await db.insert(files).values({ projectId, path: filePath });
    }
  }

  for (const file of existing) {
    if (!diskPathSet.has(file.path)) {
      await db.delete(files).where(eq(files.id, file.id));
    }
  }

  return diskPaths;
}
