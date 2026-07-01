import { LightLatexClient } from "../client";
import { loadAuth } from "../config";
import * as fs from "fs";
import * as path from "path";

interface TemplateFile { path: string; content: string; }

export async function templateApply(templateName: string) {
  const auth = loadAuth();
  if (!auth) {
    console.error("Not logged in. Run 'lightlatex login <url>' first.");
    process.exit(1);
  }

  const configPath = path.join(process.cwd(), ".lightlatex", "config.json");
  if (!fs.existsSync(configPath)) {
    console.error("No project config found. Run 'lightlatex init' first.");
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  if (!config.project_id) {
    console.error("No project_id in config.");
    process.exit(1);
  }

  const response = await fetch(`${auth.server_url}/api/templates/${templateName}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const template = await response.json() as { files: TemplateFile[] };
  if (!template || !template.files) {
    console.error(`Template "${templateName}" not found.`);
    process.exit(1);
  }

  for (const file of template.files) {
    const filePath = path.join(process.cwd(), file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf-8");
    console.log(`  ✓ ${file.path}`);
  }

  const client = new LightLatexClient(auth);
  const localFiles = template.files.map((f: TemplateFile) => ({
    path: f.path,
    content: f.content,
    hash: "",
  }));
  await client.sync(config.project_id, localFiles);

  console.log(`\nTemplate "${templateName}" applied successfully.`);
}
