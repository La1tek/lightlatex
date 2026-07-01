import { LightLatexClient } from "../client";
import { loadAuth } from "../config";

export async function templateList() {
  const auth = loadAuth();
  if (!auth) {
    console.error("Not logged in. Run 'lightlatex login <url>' first.");
    process.exit(1);
  }

  const response = await fetch(`${auth.server_url}/api/templates`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const data = await response.json() as Array<{name: string; description: string; fileCount: number}>;

  console.log("\nAvailable templates:\n");
  for (const t of data) {
    console.log(`  ${t.name.padEnd(12)} — ${t.description} (${t.fileCount} files)`);
  }
  console.log();
}
