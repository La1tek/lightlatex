import { pull } from "./pull";
import { push } from "./push";
import { loadProjectConfig, loadAuth } from "../config";
import { LightLatexClient } from "../client";
import { sha256 } from "../../shared/hash";
import fs from "fs";
import path from "path";

function isIgnored(filePath: string, ignore: string[]): boolean {
  const name = path.basename(filePath);
  for (const pattern of ignore) {
    if (pattern.startsWith("*.")) {
      if (name.endsWith(pattern.slice(1))) return true;
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

export async function sync(): Promise<void> {
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

  console.log(`Syncing with ${config.server_url}...`);

  try {
    // 1. Compute local hashes
    const localPaths = walkDir(baseDir, "", config.ignore || []);
    const localFiles = localPaths.map((p) => {
      const content = fs.readFileSync(path.join(baseDir, p), "utf-8");
      return { path: p, content, hash: sha256(content) };
    });

    // 2. Sync with server
    const result = await client.sync(config.project_id, localFiles);

    // 3. Pull files from server
    if (result.pulled && result.pulled.length > 0) {
      for (const f of result.pulled) {
        const localPath = path.join(baseDir, f.path);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, f.content || "", "utf-8");
        console.log(`  ↓ ${f.path}`);
      }
    }

    // 4. Report
    if (result.pushed && result.pushed.length > 0) {
      for (const p of result.pushed) console.log(`  ↑ ${p}`);
    }
    if (result.conflicts && result.conflicts.length > 0) {
      for (const c of result.conflicts) console.log(`  ⚠ Conflict (local wins): ${c}`);
    }

    const total = (result.pushed?.length || 0) + (result.pulled?.length || 0);
    console.log(`Sync complete: ${result.pushed?.length || 0} pushed, ${result.pulled?.length || 0} pulled, ${result.conflicts?.length || 0} conflicts`);
  } catch (err: any) {
    console.error(`Sync failed: ${err.message}`);
    process.exit(1);
  }
}
