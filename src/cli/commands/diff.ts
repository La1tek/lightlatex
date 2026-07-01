import { LightLatexClient } from "../client";
import { loadAuth } from "../config";
import * as path from "path";

export async function diffSnapshots(ts1: string, ts2: string) {
  const auth = loadAuth();
  if (!auth) {
    console.error("Not logged in. Run 'lightlatex login <url>' first.");
    process.exit(1);
  }

  const fs = require("fs");
  const configPath = path.join(process.cwd(), ".lightlatex", "config.json");
  if (!fs.existsSync(configPath)) {
    console.error("No project config found.");
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  const client = new LightLatexClient(auth);

  // Get file list from first snapshot
  const headers = { Authorization: `Bearer ${auth.token}` };
  const base = `${auth.server_url}/api/projects/${config.project_id}`;

  // List files from snapshots
  const listUrl1 = `${base}/history/${ts1}/files/main.tex`;
  const listUrl2 = `${base}/history/${ts2}/files/main.tex`;

  const [content1, content2] = await Promise.all([
    fetch(listUrl1, { headers }).then(r => r.text()),
    fetch(listUrl2, { headers }).then(r => r.text()),
  ]);

  // Simple line diff
  const lines1 = content1.split("\n");
  const lines2 = content2.split("\n");
  const maxLen = Math.max(lines1.length, lines2.length);

  console.log(`\nDiff: snapshot ${ts1} → ${ts2}\n`);

  let diffs = 0;
  for (let i = 0; i < maxLen; i++) {
    const l1 = lines1[i] ?? "";
    const l2 = lines2[i] ?? "";
    if (l1 !== l2) {
      console.log(`\x1b[31m- ${i + 1}: ${l1}\x1b[0m`);
      console.log(`\x1b[32m+ ${i + 1}: ${l2}\x1b[0m`);
      diffs++;
    }
  }

  if (diffs === 0) {
    console.log("No differences.");
  } else {
    console.log(`\n${diffs} line(s) changed.`);
  }
}
