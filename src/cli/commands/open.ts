import { loadAuth } from "../config";
import { exec } from "child_process";

export async function openProject() {
  const auth = loadAuth();
  if (!auth) {
    console.error("Not logged in. Run 'lightlatex login <url>' first.");
    process.exit(1);
  }

  // Read project config
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(process.cwd(), ".lightlatex", "config.json");
  if (!fs.existsSync(configPath)) {
    console.error("No project config found. Run 'lightlatex init' first.");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  if (!config.project_id) {
    console.error("No project_id in config. Run 'lightlatex init' first.");
    process.exit(1);
  }

  const url = `${auth.server_url}/editor/${config.project_id}`;
  console.log(`Opening ${url}`);

  const cmd = process.platform === "win32" ? "start" :
    process.platform === "darwin" ? "open" : "xdg-open";

  exec(`${cmd} "${url}"`, (err) => {
    if (err) {
      console.log(`Open this URL in your browser: ${url}`);
    }
  });
}
