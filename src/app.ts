import express from "express";
import path from "path";

import authRoutes from "./routes/auth";
import projectRoutes from "./routes/projects";
import fileRoutes from "./routes/files";
import compileRoutes from "./routes/compile";
import templateRoutes from "./routes/templates";
import adminRoutes from "./routes/admin";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use("/api/auth", authRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/templates", templateRoutes);
  app.use("/api/admin", adminRoutes);

  app.use("/api/projects", fileRoutes);
  app.use("/api/projects", compileRoutes);

  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "index.html"));
  });

  return app;
}
