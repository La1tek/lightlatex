import fs from "fs";
import path from "path";
import { LightLatexClient } from "../client";
import { loadProjectConfig, loadAuth } from "../config";

function isIgnored(filePath: string, ignore: string[]): boolean {
  const name = path.basename(filePath);
  for (const pattern of ignore) {
    if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1);
      if (name.endsWith(ext)) return true;
    } else if (name === pattern || filePath === pattern) {
      return true;
    }
  }
  return false;
}

function walkDir(dir: string, base: string = "", ignore: string[]): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!isIgnored(rel, ignore)) {
        results.push(...walkDir(path.join(dir, entry.name), rel, ignore));
      }
    } else {
      if (!isIgnored(rel, ignore)) {
        results.push(rel);
      }
    }
  }
  return results;
}

export async function push(): Promise<void> {
  const config = loadProjectConfig();
  if (!config) {
    console.error("Not a LightTeX project. Run 'lightlatex init' first.");
    process.exit(1);
  }
  const auth = loadAuth();
  if (!auth) {
    console.error("Not logged in. Run 'lightlatex login <url>' first.");
    process.exit(1);
  }

  const client = new LightLatexClient(auth);
  const baseDir = process.cwd();

  console.log(`Pushing files to ${config.server_url}...`);

  try {
    const localFiles = walkDir(baseDir, "", config.ignore || []);
    let pushed = 0;

    // Get server file list
    const serverFiles = await client.getFiles(config.project_id);
    const serverPaths = new Set(serverFiles.map((f: any) => f.path));

    for (const relPath of localFiles) {
      const fullPath = path.join(baseDir, relPath);
      const content = fs.readFileSync(fullPath, "utf-8");

      if (serverPaths.has(relPath)) {
        await client.updateFile(config.project_id, relPath, content);
      } else {
        await client.createFile(config.project_id, relPath, content);
      }
      pushed++;
      console.log(`  ✓ ${relPath}`);
    }

    console.log(`Pushed ${pushed} file(s)`);
  } catch (err: any) {
    console.error(`Push failed: ${err.message}`);
    process.exit(1);
  }
}
