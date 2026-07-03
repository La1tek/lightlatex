import crypto from "crypto";
import { requireProjectAccess } from "../auth/projectAccess";
import { compileProject, CompileResult } from "../compiler/engine";
import { createSnapshot } from "../storage/fs";
import { HttpError } from "../shared/errors";

export type CompileJobStatus = "queued" | "running" | "success" | "warning" | "error" | "cancelled";

export interface CompileJob {
  id: string;
  projectId: string;
  userId: string;
  compiler: string;
  mainFile: string;
  status: CompileJobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  pdfGenerated?: boolean;
  errorCount: number;
  warningCount: number;
  message?: string;
  result?: CompileResult;
  snapshotTimestamp?: string;
}

const jobs = new Map<string, CompileJob>();
const controllers = new Map<string, AbortController>();
const projectQueues = new Map<string, Promise<unknown>>();

function serializeJob(job: CompileJob) {
  const { userId: _userId, ...safeJob } = job;
  return safeJob;
}

function rememberJob(job: CompileJob) {
  jobs.set(job.id, job);
  const allJobs = Array.from(jobs.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  while (allJobs.length > 200) {
    const stale = allJobs.shift();
    if (stale) jobs.delete(stale.id);
  }
}

function findJob(projectId: string, jobId: string) {
  const job = jobs.get(jobId);
  if (!job || job.projectId !== projectId) throw new HttpError("Compile job not found", 404);
  return job;
}

export async function runTrackedCompile(projectId: string, userId: string) {
  const { project } = await requireProjectAccess(projectId, userId, "editor");
  const job: CompileJob = {
    id: crypto.randomUUID(),
    projectId: project.id,
    userId,
    compiler: project.compiler || "pdflatex",
    mainFile: project.mainFile || "main.tex",
    status: "queued",
    createdAt: new Date().toISOString(),
    errorCount: 0,
    warningCount: 0,
  };
  rememberJob(job);

  const previous = projectQueues.get(project.id) || Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const started = Date.now();
    const controller = new AbortController();
    controllers.set(job.id, controller);
    job.status = "running";
    job.startedAt = new Date(started).toISOString();

    try {
      const result = await compileProject(project.id, job.mainFile, job.compiler, { signal: controller.signal });
      job.result = result;
      job.pdfGenerated = result.pdfGenerated;
      job.errorCount = result.errors.filter((item) => item.severity !== "warning").length;
      job.warningCount = result.errors.filter((item) => item.severity === "warning").length;
      if (controller.signal.aborted) {
        job.status = "cancelled";
        job.message = "Compilation cancelled";
      } else if (result.success && job.warningCount > 0) {
        job.status = "warning";
        job.message = `Compiled with ${job.warningCount} warning(s)`;
      } else if (result.success) {
        job.status = "success";
        job.message = "Compiled successfully";
      } else {
        job.status = "error";
        job.message = job.errorCount ? `Failed with ${job.errorCount} error(s)` : "Compilation failed";
      }

      if (result.success) {
        try {
          job.snapshotTimestamp = await createSnapshot(project.id, {
            type: "compile",
            message: job.warningCount > 0 ? job.message : "Successful compile",
            compileJobId: job.id,
          });
        } catch {
          // Snapshots are useful but must not fail a compile result.
        }
      }

      return { ...result, jobId: job.id, job: serializeJob(job) };
    } catch (err: any) {
      const message = err?.message || "Compilation failed";
      const result: CompileResult = {
        success: false,
        errors: [{ line: 0, message, severity: "error" }],
        pdfGenerated: false,
        log: message,
      };
      job.status = controller.signal.aborted ? "cancelled" : "error";
      job.errorCount = 1;
      job.warningCount = 0;
      job.pdfGenerated = false;
      job.message = message;
      job.result = result;
      return { ...result, jobId: job.id, job: serializeJob(job) };
    } finally {
      controllers.delete(job.id);
      job.finishedAt = new Date().toISOString();
      job.durationMs = Date.now() - started;
    }
  });

  projectQueues.set(project.id, run.catch(() => undefined));
  return run;
}

export async function listCompileJobs(projectId: string, userId: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  return Array.from(jobs.values())
    .filter((job) => job.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(serializeJob);
}

export async function getCompileJob(projectId: string, userId: string, jobId: string) {
  await requireProjectAccess(projectId, userId, "viewer");
  return serializeJob(findJob(projectId, jobId));
}

export async function cancelCompileJob(projectId: string, userId: string, jobId: string) {
  await requireProjectAccess(projectId, userId, "editor");
  const job = findJob(projectId, jobId);
  if (job.status !== "queued" && job.status !== "running") {
    throw new HttpError("Compile job is not running", 409);
  }
  const controller = controllers.get(job.id);
  if (controller) controller.abort();
  job.status = "cancelled";
  job.message = "Cancellation requested";
  return serializeJob(job);
}

export async function retryCompileJob(projectId: string, userId: string, jobId: string) {
  await requireProjectAccess(projectId, userId, "editor");
  findJob(projectId, jobId);
  return runTrackedCompile(projectId, userId);
}
