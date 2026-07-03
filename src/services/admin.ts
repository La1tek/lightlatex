import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import os from "os";
import { asc, count, eq } from "drizzle-orm";
import { db } from "../db";
import { files, projects, users } from "../db/schema";
import { HttpError } from "../shared/errors";
import { config } from "../config";
import { listAuditEvents } from "./audit";

const execFileAsync = promisify(execFile);

const PROJECTS_DIR = config.projectsDir;
const COMPILERS = ["pdflatex", "xelatex", "lualatex"];

function commandExists(command: string) {
  return execFileAsync("which", [command]);
}

function runCommand(command: string, args: string[], options: { timeout?: number; env?: NodeJS.ProcessEnv } = {}) {
  return execFileAsync(command, args, {
    timeout: options.timeout,
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
}

function runToFile(command: string, args: string[], outputPath: string, options: { timeout?: number; env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = fsSync.createWriteStream(outputPath);
    const stderr: Buffer[] = [];
    const timeout = options.timeout ? setTimeout(() => child.kill("SIGTERM"), options.timeout) : null;

    child.stdout.pipe(out);
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      out.close();
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(Buffer.concat(stderr).toString("utf-8") || `${command} exited with code ${code}`));
      }
    });
  });
}

function runFromFile(command: string, args: string[], inputPath: string, options: { timeout?: number; env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ["pipe", "ignore", "pipe"],
    });
    const input = fsSync.createReadStream(inputPath);
    const stderr: Buffer[] = [];
    const timeout = options.timeout ? setTimeout(() => child.kill("SIGTERM"), options.timeout) : null;

    input.pipe(child.stdin);
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(Buffer.concat(stderr).toString("utf-8") || `${command} exited with code ${code}`));
      }
    });
  });
}

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
    const { stdout } = await runCommand("du", ["-sb", PROJECTS_DIR]);
    diskUsage = parseInt(stdout.split(/\s/)[0]) || 0;
  } catch {
    // ignore
  }

  let containerStats: any = null;
  try {
    const hostname = os.hostname();
    const { stdout } = await runCommand("docker", ["stats", "--no-stream", "--format", "{{.CPUPerc}} {{.MemUsage}}", hostname]);
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
      fs.readFile("/proc/loadavg", "utf-8").then((stdout) => ({ stdout })).catch(() => ({ stdout: "N/A" })),
      fs.readFile("/proc/meminfo", "utf-8").then((stdout) => ({ stdout })).catch(() => ({ stdout: "N/A" })),
    ]);
    const memLines = memInfo.stdout.split("\n");
    sysStats = {
      loadAvg: cpuInfo.stdout.trim().split(/\s+/).slice(0, 3).join(", "),
      memory: memLines.slice(0, 3).map((line) => line.trim()).join("; ") || "N/A",
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
      const { stdout } = await commandExists(compiler);
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
    const { stdout } = await runCommand("du", ["-sb", PROJECTS_DIR]);
    diskUsage = parseInt(stdout.split(/\s/)[0]) || 0;
  } catch {
    // ignore
  }

  const quotas = {
    storagePerUserMB: config.quotas.storagePerUserMB,
    compileTimeoutMs: config.quotas.compileTimeoutMs,
    maxUploadMB: Math.round(config.upload.maxZipBytes / (1024 * 1024)),
    maxImageUploadMB: Math.round(config.upload.maxImageBytes / (1024 * 1024)),
    registrationMode: config.auth.registrationMode,
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

export async function listAdminAuditEvents(userId: string, limit?: number) {
  await requireAdmin(userId);
  return listAuditEvents(limit);
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
      await runToFile("pg_dump", [dbUrl], dbDump, { timeout: 30000 });
    } catch {
      const url = new URL(dbUrl);
      await runToFile("pg_dump", ["-h", url.hostname, "-p", url.port || "5432", "-U", url.username, "-d", url.pathname.slice(1)], dbDump, {
        timeout: 30000,
        env: { PGPASSWORD: url.password },
      });
    }
  }

  const filesToInclude = [PROJECTS_DIR];
  if (dbDump) filesToInclude.push(dbDump);
  await runCommand("tar", ["-czf", backupFile, ...filesToInclude], { timeout: 60000 });

  const content = await fs.readFile(backupFile);
  await fs.unlink(backupFile);
  if (dbDump) await fs.unlink(dbDump).catch(() => {});

  return { timestamp, content };
}

export async function restoreAdminBackup(userId: string, uploadPath: string) {
  await requireAdmin(userId);

  const restoreDir = "/tmp/lightlatex-restore";
  await fs.rm(restoreDir, { recursive: true, force: true });
  await fs.mkdir(restoreDir, { recursive: true });
  await runCommand("tar", ["-xzf", uploadPath, "-C", restoreDir], { timeout: 60000 });

  const restoredProjects = `${restoreDir}/${path.basename(PROJECTS_DIR)}`;
  try {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
    await fs.cp(restoredProjects, PROJECTS_DIR, { recursive: true, force: true });
  } catch {
    // different dir name
  }

  const dbDump = `${restoreDir}/lightlatex-backup-db.sql`;
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const url = new URL(dbUrl);
      await runFromFile("psql", ["-h", url.hostname, "-p", url.port || "5432", "-U", url.username, "-d", url.pathname.slice(1)], dbDump, {
        timeout: 60000,
        env: { PGPASSWORD: url.password },
      });
    }
  } catch {
    // no DB dump in backup
  }
}
