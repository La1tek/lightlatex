import fs from "fs/promises";
import { createApp } from "./app";
import { config } from "./config";
import { bootstrapDatabase } from "./db/bootstrap";

export async function startServer() {
  try {
    await bootstrapDatabase();
    console.log("Database tables ready");
  } catch (err) {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  }

  await fs.mkdir(config.projectsDir, { recursive: true });

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`LightTeX v0.4 running on http://localhost:${config.port}`);
  });
}
