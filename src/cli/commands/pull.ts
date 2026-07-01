import fs from "fs";
import path from "path";
import { LightLatexClient } from "../client";
import { loadProjectConfig, loadAuth } from "../config";

export async function pull(): Promise<void> {
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

  console.log(`Pulling files from ${config.server_url}...`);

  try {
    const files = await client.getFiles(config.project_id);
    let pulled = 0;

    for (const f of files) {
      const content = await client.getFileContent(config.project_id, f.path);
      const localPath = path.join(baseDir, f.path);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, content, "utf-8");
      pulled++;
      console.log(`  ✓ ${f.path}`);
    }

    console.log(`Pulled ${pulled} file(s)`);
  } catch (err: any) {
    console.error(`Pull failed: ${err.message}`);
    process.exit(1);
  }
}
