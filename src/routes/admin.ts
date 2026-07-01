import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { db } from "../db";
import { users, projects } from "../db/schema";
import { eq, count, sql, asc } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

const execAsync = promisify(exec);

const router = Router();
router.use(authMiddleware);

const PROJECTS_DIR = process.env.PROJECTS_DIR || "./data/projects";

// Check if user is admin (first registered user or ADMIN_EMAIL)
async function isAdmin(userId: string): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user && user.email === adminEmail) return true;
  }

  // First registered user is admin
  const allUsers = await db.select().from(users).orderBy(asc(users.createdAt));
  if (allUsers.length > 0 && allUsers[0].id === userId) return true;

  return false;
}

// GET /api/admin/stats
router.get("/stats", async (req: AuthRequest, res: Response) => {
  if (!await isAdmin(req.userId!)) return res.status(403).json({ error: "Admin only" });

  try {
    const userCount = (await db.select({ count: count() }).from(users))[0].count;
    const projectCount = (await db.select({ count: count() }).from(projects))[0].count;

    // Disk usage
    let diskUsage = 0;
    try {
      const { stdout } = await execAsync(`du -sb ${PROJECTS_DIR} 2>/dev/null`);
      diskUsage = parseInt(stdout.split(/\s/)[0]) || 0;
    } catch { /* ignore */ }

    // Container stats (if Docker)
    let containerStats: any = null;
    try {
      const hostname = os.hostname();
      const { stdout } = await execAsync(`docker stats --no-stream --format "{{.CPUPerc}} {{.MemUsage}}" ${hostname} 2>/dev/null`);
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 2) {
        containerStats = {
          cpu: parts[0],
          memory: parts[1],
        };
      }
    } catch { /* not in Docker or no access */ }

    // System stats
    let sysStats: any = null;
    try {
      const [cpuInfo, memInfo] = await Promise.all([
        execAsync("cat /proc/loadavg 2>/dev/null || echo 'N/A'").catch(() => ({ stdout: "N/A" })),
        execAsync("free -m 2>/dev/null | head -2 || echo 'N/A'").catch(() => ({ stdout: "N/A" })),
      ]);
      sysStats = {
        loadAvg: cpuInfo.stdout.trim().split(/\s+/).slice(0, 3).join(", "),
        memory: memInfo.stdout.trim().split("\n")[1]?.trim() || "N/A",
      };
    } catch { /* ignore */ }

    res.json({
      users: userCount,
      projects: projectCount,
      diskUsage,
      diskUsageMB: Math.round(diskUsage / (1024 * 1024)),
      containerStats,
      systemStats: sysStats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users
router.get("/users", async (req: AuthRequest, res: Response) => {
  if (!await isAdmin(req.userId!)) return res.status(403).json({ error: "Admin only" });

  const allUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    createdAt: users.createdAt,
    lastLogin: users.lastLogin,
  }).from(users);

  // Add project counts
  const result = [];
  for (const u of allUsers) {
    const pCount = (await db.select({ count: count() }).from(projects).where(eq(projects.userId, u.id)))[0].count;
    result.push({ ...u, projectCount: pCount, password: undefined });
  }

  res.json(result);
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", async (req: AuthRequest, res: Response) => {
  if (!await isAdmin(req.userId!)) return res.status(403).json({ error: "Admin only" });

  const userId = String(req.params.id);
  if (userId === req.userId!) return res.status(400).json({ error: "Cannot delete yourself" });

  await db.delete(users).where(eq(users.id, userId));
  res.json({ ok: true });
});

// POST /api/admin/backup
router.post("/backup", async (req: AuthRequest, res: Response) => {
  if (!await isAdmin(req.userId!)) return res.status(403).json({ error: "Admin only" });

  try {
    const { spawn } = await import("child_process");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = `/tmp/lightlatex-backup-${timestamp}.tar.gz`;

    // pg_dump if DATABASE_URL is set
    const dbUrl = process.env.DATABASE_URL;
    const dbDump = dbUrl ? "/tmp/lightlatex-backup-db.sql" : null;

    if (dbUrl) {
      const { execSync } = await import("child_process");
      try {
        execSync(`pg_dump "${dbUrl}" > ${dbDump}`, { timeout: 30000 });
      } catch {
        // pg_dump might fail, try with env parsing
        const url = new URL(dbUrl);
        execSync(`PGPASSWORD=${url.password} pg_dump -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.slice(1)} > ${dbDump}`, { timeout: 30000 });
      }
    }

    // Create tar
    const filesToInclude = [PROJECTS_DIR];
    if (dbDump) filesToInclude.push(dbDump);

    const { execSync } = await import("child_process");
    execSync(`tar -czf ${backupFile} ${filesToInclude.join(" ")}`, { timeout: 60000 });

    const content = await fs.readFile(backupFile);
    await fs.unlink(backupFile);
    if (dbDump) await fs.unlink(dbDump).catch(() => {});

    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", `attachment; filename="lightlatex-backup-${timestamp}.tar.gz"`);
    res.send(content);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/restore
const multer = require("multer");
const upload = multer({ dest: "/tmp/lightlatex-uploads/", limits: { fileSize: 1024 * 1024 * 1024 } }); // 1GB

router.post("/restore", upload.single("backup"), async (req: AuthRequest, res: Response) => {
  if (!await isAdmin(req.userId!)) return res.status(403).json({ error: "Admin only" });

  try {
    if (!req.file) return res.status(400).json({ error: "No backup file uploaded" });

    const { execSync } = await import("child_process");
    execSync(`tar -xzf ${req.file.path} -C /tmp/lightlatex-restore/`, { timeout: 60000 });

    // Restore projects
    const restoredProjects = `/tmp/lightlatex-restore/${path.basename(PROJECTS_DIR)}`;
    try {
      execSync(`cp -r ${restoredProjects}/* ${PROJECTS_DIR}/`);
    } catch { /* different dir name */ }

    // Restore DB if included
    const dbDump = "/tmp/lightlatex-restore/lightlatex-backup-db.sql";
    try {
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        const url = new URL(dbUrl);
        execSync(`PGPASSWORD=${url.password} psql -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.slice(1)} < ${dbDump}`);
      }
    } catch { /* no DB dump in backup */ }

    await fs.unlink(req.file.path).catch(() => {});
    res.json({ ok: true, message: "Backup restored. Restart recommended." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
