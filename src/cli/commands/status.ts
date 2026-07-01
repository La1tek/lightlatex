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

export async function status(): Promise<void> {
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

  try {
    // Get server files with hashes
    const serverFiles = await client.getFilesWithHashes(config.project_id);
    const serverMap = new Map<string, string>(serverFiles.map((f: any) => [f.path as string, f.hash as string]));

    // Compute local hashes
    const localPaths = walkDir(baseDir, "", config.ignore || []);
    const localMap = new Map<string, string>();
    for (const p of localPaths) {
      const content = fs.readFileSync(path.join(baseDir, p), "utf-8");
      localMap.set(p, sha256(content));
    }

    const onlyLocal: string[] = [];
    const onlyServer: string[] = [];
    const modified: string[] = [];
    const same: string[] = [];

    // Check local files
    for (const [p, hash] of localMap) {
      const serverHash = serverMap.get(p);
      if (!serverHash) {
        onlyLocal.push(p);
      } else if (hash !== serverHash) {
        modified.push(p);
      } else {
        same.push(p);
      }
    }

    // Check server files not local
    for (const [p] of serverMap) {
      if (!localMap.has(p)) {
        onlyServer.push(p);
      }
    }

    if (onlyLocal.length > 0) {
      console.log("\nOnly local (not on server):");
      onlyLocal.forEach((f) => console.log(`  + ${f}`));
    }

    if (onlyServer.length > 0) {
      console.log("\nOnly on server (not pulled):");
      onlyServer.forEach((f) => console.log(`  - ${f}`));
    }

    if (modified.length > 0) {
      console.log("\nModified locally (different from server):");
      modified.forEach((f) => console.log(`  * ${f}`));
    }

    if (onlyLocal.length === 0 && onlyServer.length === 0 && modified.length === 0) {
      console.log("Local and server are in sync.");
    }

    console.log(`\n${localMap.size} local files, ${serverMap.size} server files`);
  } catch (err: any) {
    console.error(`Status check failed: ${err.message}`);
    process.exit(1);
  }
}
