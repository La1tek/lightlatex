import fs from "fs";
import path from "path";
import os from "os";

const AUTH_DIR = path.join(os.homedir(), ".lightlatex");
const AUTH_FILE = path.join(AUTH_DIR, "auth.json");
const PROJECT_CONFIG_FILE = ".lightlatex/config.json";

export interface AuthConfig {
  server_url: string;
  token: string;
}

export interface ProjectConfig {
  project_id: string;
  server_url: string;
  main_file: string;
  compiler: string;
  ignore: string[];
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadAuth(): AuthConfig | null {
  try {
    const raw = fs.readFileSync(AUTH_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveAuth(config: AuthConfig): void {
  ensureDir(AUTH_DIR);
  fs.writeFileSync(AUTH_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function clearAuth(): void {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }
}

export function getAuthDir(): string {
  return AUTH_DIR;
}

export function loadProjectConfig(baseDir?: string): ProjectConfig | null {
  const dir = baseDir || process.cwd();
  const configPath = path.join(dir, PROJECT_CONFIG_FILE);
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveProjectConfig(config: ProjectConfig, baseDir?: string): void {
  const dir = baseDir || process.cwd();
  const configDir = path.join(dir, ".lightlatex");
  ensureDir(configDir);
  fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify(config, null, 2), "utf-8");
}

export function getProjectConfigFile(): string {
  return path.join(process.cwd(), PROJECT_CONFIG_FILE);
}
