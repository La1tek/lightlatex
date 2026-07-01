import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { ensureDir } from "../storage/fs";

interface CompileResult {
  success: boolean;
  errors: CompileError[];
  pdfGenerated: boolean;
  log?: string;
}

interface CompileError {
  line: number;
  column?: number;
  message: string;
  severity: "error" | "warning";
}

export async function compileProject(
  projectId: string,
  mainFile: string,
  compiler: string
): Promise<CompileResult> {
  const projectsDir = process.env.PROJECTS_DIR || "./data/projects";
  const projectDir = path.join(projectsDir, projectId);

  // Ensure output dir exists
  await ensureDir(projectDir);

  // Create sandbox
  const sandboxDir = path.join(os.tmpdir(), `lightlatex-${projectId}-${Date.now()}`);
  await fs.promises.mkdir(sandboxDir, { recursive: true });

  try {
    // Copy project files to sandbox
    await copyDir(projectDir, sandboxDir);

    // Check main file exists
    const mainPath = path.join(sandboxDir, mainFile);
    if (!fs.existsSync(mainPath)) {
      throw new Error(`Main file '${mainFile}' not found`);
    }

    // Run compiler
    const compilerBin = compiler || "pdflatex";
    const errors: CompileError[] = [];

    const result = await runCompiler(compilerBin, sandboxDir, mainFile, errors);

    // Parse log for additional errors
    const logPath = mainPath.replace(/\.tex$/, ".log");
    if (fs.existsSync(logPath)) {
      const logContent = await fs.promises.readFile(logPath, "utf-8");
      parseLatexLog(logContent, errors);
    }

    // Copy PDF back if generated
    const pdfPath = mainPath.replace(/\.tex$/, ".pdf");
    let pdfGenerated = false;
    if (fs.existsSync(pdfPath)) {
      await fs.promises.copyFile(pdfPath, path.join(projectDir, "output.pdf"));
      pdfGenerated = true;
    }

    return {
      success: result.success,
      errors: dedupErrors(errors),
      pdfGenerated,
    };
  } finally {
    // Cleanup sandbox
    await fs.promises.rm(sandboxDir, { recursive: true, force: true });
  }
}

function runCompiler(
  compiler: string,
  cwd: string,
  mainFile: string,
  errors: CompileError[]
): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    const texliveBin = "/usr/local/texlive/2026/bin/x86_64-linux";
    const envPath = `${texliveBin}:${process.env.PATH}`;

    const proc = spawn(compiler, [
      "-interaction=nonstopmode",
      "-file-line-error",
      mainFile,
    ], {
      cwd,
      timeout: 30000,
      env: { ...process.env, PATH: envPath },
    });

    let stderr = "";
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      errors.push({ line: 0, message: "Compilation timed out (30s)", severity: "error" });
      resolve({ success: false });
    }, 35000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const success = code === 0;
      if (!success && !errors.some(e => e.severity === "error")) {
        errors.push({ line: 0, message: `Compiler exited with code ${code}`, severity: "error" });
      }
      resolve({ success });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      errors.push({ line: 0, message: `Failed to run ${compiler}: ${err.message}`, severity: "error" });
      resolve({ success: false });
    });
  });
}

function parseLatexLog(log: string, errors: CompileError[]) {
  const lines = log.split("\n");
  for (const line of lines) {
    // Pattern: ./file.tex:LINE: ERROR
    let match = line.match(/^(.+?):(\d+):\s*(.+)/);
    if (match) {
      const msg = match[3].trim();
      if (msg.includes("Error") || msg.includes("error") || msg.includes("Undefined control sequence")) {
        errors.push({ line: parseInt(match[2]), message: msg, severity: "error" });
      } else if (msg.includes("Warning") || msg.includes("warning")) {
        errors.push({ line: parseInt(match[2]), message: msg, severity: "warning" });
      }
      continue;
    }

    // Pattern: ! LaTeX Error: ...
    match = line.match(/^! (.+)/);
    if (match) {
      // Try to find line number from l.XX
      const lineMatch = log.substring(0, log.indexOf(line)).match(/l\.(\d+)/g);
      const lineNum = lineMatch ? parseInt(lineMatch[lineMatch.length - 1].replace("l.", "")) : 0;
      errors.push({ line: lineNum, message: match[1], severity: "error" });
    }

    // Warning pattern
    match = line.match(/^(Warning|Package \w+ Warning):\s*(.+)/i);
    if (match) {
      const lineMatch = log.substring(0, log.indexOf(line)).match(/l\.(\d+)/g);
      const lineNum = lineMatch ? parseInt(lineMatch[lineMatch.length - 1].replace("l.", "")) : 0;
      errors.push({ line: lineNum, message: `${match[1]}: ${match[2]}`, severity: "warning" });
    }
  }
}

function dedupErrors(errors: CompileError[]): CompileError[] {
  const seen = new Set<string>();
  return errors.filter(e => {
    const key = `${e.line}:${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function copyDir(src: string, dest: string) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}
