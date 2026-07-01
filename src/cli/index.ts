#!/usr/bin/env node

import { login } from "./commands/login";
import { init } from "./commands/init";
import { pull } from "./commands/pull";
import { push } from "./commands/push";
import { sync } from "./commands/sync";
import { watch } from "./commands/watch";
import { compile } from "./commands/compile";
import { status } from "./commands/status";
import { loadAuth } from "./config";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case "login":
      if (!args[1]) {
        console.error("Usage: lightlatex login <server-url>");
        console.error("Example: lightlatex login https://lightlatex.example.com");
        process.exit(1);
      }
      await login(args[1]);
      break;

    case "init":
      await init();
      break;

    case "pull":
      await pull();
      break;

    case "push":
      await push();
      break;

    case "sync":
      await sync();
      break;

    case "watch":
      await watch();
      break;

    case "compile":
      await compile();
      break;

    case "status":
      await status();
      break;

    case "--version":
    case "-v":
      console.log("lightlatex v0.4.0");
      break;

    case "--help":
    case "-h":
    default:
      console.log(`
LightTeX CLI v0.4.0 — LaTeX project sync & compile tool

Commands:
  login <url>      Log in to a LightTeX server
  init             Initialize project (connect or create)
  pull             Download files from server
  push             Upload files to server
  sync             Two-way sync (pull + push)
  watch            Auto-sync on file changes (requires chokidar)
  compile          Compile locally with system TeX Live
  status           Show diff between local and server

Options:
  -v, --version    Show version
  -h, --help       Show this help

Config:
  ~/.lightlatex/auth.json     — Server auth token
  .lightlatex/config.json     — Project config (in project root)
`);
      if (command && command !== "--help" && command !== "-h") {
        process.exit(1);
      }
      break;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
