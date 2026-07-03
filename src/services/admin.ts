import fs from "fs/promises";
import path from "path";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import os from "os";
import { asc, count, eq } from "drizzle-orm";
import { db } from "../db";
import { files, projects, users } from "../db/schema";
import { HttpError } from "../shared/errors";

const execAsync = promisify(exec);

const PROJECTS_DIR = process.env.PROJECTS_DIR || "./data/projects";
const COMPILERS = ["pdflatex", "xelatex", "lualatex"];

export async function isAdmin(userId: string): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user && user.email === adminEmail) return true;
  }

  const allUsers = await db.select().from(users).orderBy(asc(users.createdAt));
  return allUsers.length > 0 && allUsers[0].id === userId;
}

export async function requireAdmin(userId: string) {
  if (!await isAdmin(userId)) throw new HttpError("Admin only", 403);
}

export async function getAdminStats(userId: string) {
  await requireAdmin(userId);

  const userCount = (await db.select({ count: count() }).from(users))[0].count;
  const projectCount = (await db.select({ count: count() }).from(projects))[0].count;

  let diskUsage = 0;
  try {
    const { stdout } = await execAsync(`du -sb ${PROJECTS_DIR} 2>/dev/null`);
    diskUsage = parseInt(stdout.split(/\s/)[0]) || 0;
  } catch {
    // ignore
  }

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
  } catch {
    // not in Docker or no access
  }

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
  } catch {
    // ignore
  }

  return {
    users: userCount,
    projects: projectCount,
    diskUsage,
    diskUsageMB: Math.round(diskUsage / (1024 * 1024)),
    containerStats,
    systemStats: sysStats,
  };
}

export async function getAdminHealth(userId: string) {
  await requireAdmin(userId);

  const startedAt = Date.now();
  const checks: Array<{ name: string; status: "ok" | "warning" | "error"; detail: string }> = [];

  try {
    await db.select({ count: count() }).from(users);
    checks.push({ name: "Database", status: "ok", detail: "Postgres query succeeded" });
  } catch (err: any) {
    checks.push({ name: "Database", status: "error", detail: err.message });
  }

  try {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
    await fs.access(PROJECTS_DIR);
    checks.push({ name: "Project storage", status: "ok", detail: PROJECTS_DIR });
  } catch (err: any) {
    checks.push({ name: "Project storage", status: "error", detail: err.message });
  }

  const compilerChecks = [];
  for (const compiler of COMPILERS) {
    try {
      const { stdout } = await execAsync(`command -v ${compiler}`);
      compilerChecks.push({ compiler, status: "ok", path: stdout.trim() });
    } catch {
      compilerChecks.push({ compiler, status: "warning", path: "not found in PATH" });
    }
  }

  const [userCount, projectCount, fileCount] = await Promise.all([
    db.select({ count: count() }).from(users).then((rows) => rows[0].count).catch(() => 0),
    db.select({ count: count() }).from(projects).then((rows) => rows[0].count).catch(() => 0),
    db.select({ count: count() }).from(files).then((rows) => rows[0].count).catch(() => 0),
  ]);

  let diskUsage = 0;
  try {
    const { stdout } = await execAsync(`du -sb "${PROJECTS_DIR}" 2>/dev/null`);
    diskUsage = parseInt(stdout.split(/\s/)[0]) || 0;
  } catch {
    // ignore
  }

  const quotas = {
    storagePerUserMB: Number(process.env.STORAGE_QUOTA_MB || 0),
    compileTimeoutMs: Number(process.env.COMPILE_TIMEOUT_MS || 30000),
    maxUploadMB: Number(process.env.MAX_UPLOAD_MB || 50),
    maxImageUploadMB: Number(process.env.MAX_IMAGE_UPLOAD_MB || 20),
  };

  return {
    status: checks.some((check) => check.status === "error") ? "error" : compilerChecks.some((check) => check.status !== "ok") ? "warning" : "ok",
    latencyMs: Date.now() - startedAt,
    uptimeSec: Math.round(process.uptime()),
    version: process.env.npm_package_version || "0.4.0",
    checks,
    compilers: compilerChecks,
    quotas,
    metrics: {
      users: userCount,
      projects: projectCount,
      files: fileCount,
      diskUsage,
      diskUsageMB: Math.round(diskUsage / (1024 * 1024)),
      compileJobsToday: "not_tracked",
    },
  };
}

export async function listAdminUsers(userId: string) {
  await requireAdmin(userId);

  const allUsers = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    createdAt: users.createdAt,
    lastLogin: users.lastLogin,
  }).from(users);

  const result = [];
  for (const u of allUsers) {
    const projectCount = (await db.select({ count: count() }).from(projects).where(eq(projects.userId, u.id)))[0].count;
    result.push({ ...u, projectCount, password: undefined });
  }

  return result;
}

export async function deleteAdminUser(adminUserId: string, targetUserId: string) {
  await requireAdmin(adminUserId);
  if (targetUserId === adminUserId) throw new HttpError("Cannot delete yourself", 400);
  await db.delete(users).where(eq(users.id, targetUserId));
}

export async function createAdminBackup(userId: string) {
  await requireAdmin(userId);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = `/tmp/lightlatex-backup-${timestamp}.tar.gz`;
  const dbUrl = process.env.DATABASE_URL;
  const dbDump = dbUrl ? "/tmp/lightlatex-backup-db.sql" : null;

  if (dbUrl && dbDump) {
    try {
      execSync(`pg_dump "${dbUrl}" > ${dbDump}`, { timeout: 30000 });
    } catch {
      const url = new URL(dbUrl);
      execSync(`PGPASSWORD=${url.password} pg_dump -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.slice(1)} > ${dbDump}`, { timeout: 30000 });
    }
  }

  const filesToInclude = [PROJECTS_DIR];
  if (dbDump) filesToInclude.push(dbDump);
  execSync(`tar -czf ${backupFile} ${filesToInclude.join(" ")}`, { timeout: 60000 });

  const content = await fs.readFile(backupFile);
  await fs.unlink(backupFile);
  if (dbDump) await fs.unlink(dbDump).catch(() => {});

  return { timestamp, content };
}

export async function restoreAdminBackup(userId: string, uploadPath: string) {
  await requireAdmin(userId);

  execSync(`tar -xzf ${uploadPath} -C /tmp/lightlatex-restore/`, { timeout: 60000 });

  const restoredProjects = `/tmp/lightlatex-restore/${path.basename(PROJECTS_DIR)}`;
  try {
    execSync(`cp -r ${restoredProjects}/* ${PROJECTS_DIR}/`);
  } catch {
    // different dir name
  }

  const dbDump = "/tmp/lightlatex-restore/lightlatex-backup-db.sql";
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const url = new URL(dbUrl);
      execSync(`PGPASSWORD=${url.password} psql -h ${url.hostname} -p ${url.port || 5432} -U ${url.username} -d ${url.pathname.slice(1)} < ${dbDump}`);
    }
  } catch {
    // no DB dump in backup
  }
}
