import { sync } from "./sync";

export async function watch(): Promise<void> {
  console.log("Watching for changes... (press Ctrl+C to stop)");

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isSyncing = false;

  // Initial sync
  try {
    await sync();
  } catch (err: any) {
    console.error(`Initial sync failed: ${err.message}`);
  }

  // Use chokidar if available, otherwise fallback to polling
  let chokidar: any;
  try {
    chokidar = require("chokidar");
  } catch {
    console.error("chokidar is required for watch mode. Install it with: npm install chokidar");
    process.exit(1);
  }

  const watcher = chokidar.watch(".", {
    ignored: [
      ".git",
      "node_modules",
      ".lightlatex",
      "*.aux",
      "*.log",
      "*.out",
      "*.synctex.gz",
      "*.pdf",
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  watcher.on("all", (_event: string, _path: string) => {
    if (isSyncing) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      isSyncing = true;
      try {
        await sync();
      } catch (err: any) {
        console.error(`Auto-sync failed: ${err.message}`);
      } finally {
        isSyncing = false;
      }
    }, 1000);
  });

  watcher.on("error", (err: Error) => {
    console.error(`Watcher error: ${err.message}`);
  });

  process.on("SIGINT", () => {
    watcher.close();
    console.log("\nStopped watching.");
    process.exit(0);
  });
}
