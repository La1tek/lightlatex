import fs from "fs";
import path from "path";
import { LightLatexClient } from "../client";
import { loadAuth, loadProjectConfig, saveProjectConfig, ProjectConfig } from "../config";

export async function init(): Promise<void> {
  const auth = loadAuth();
  if (!auth) {
    console.error("Not logged in. Run 'lightlatex login <url>' first.");
    process.exit(1);
  }

  const client = new LightLatexClient(auth);

  // Check for existing config
    const existing = loadProjectConfig();
  if (existing) {
    console.log(`Already connected to project ${existing.project_id}`);
    console.log(`Server: ${existing.server_url}`);
    return;
  }

  // List available projects or create new
  let projects;
  try {
    projects = await client.getProjects();
  } catch (err: any) {
    console.error(`Failed to fetch projects: ${err.message}`);
    process.exit(1);
  }

  if (projects.length === 0) {
    console.log("No projects found. Creating a new one...");
    const name = path.basename(process.cwd());
    const project = await client.createProject(name);
    const config: ProjectConfig = {
      project_id: project.id,
      server_url: auth.server_url,
      main_file: "main.tex",
      compiler: project.compiler || "pdflatex",
      ignore: ["*.aux", "*.log", "*.out", "*.synctex.gz", ".git", "node_modules", ".lightlatex"],
    };
    saveProjectConfig(config);
    console.log(`Created project "${name}" (${project.id})`);
    console.log("Config saved to .lightlatex/config.json");
    console.log("Run 'lightlatex pull' to download files.");
    return;
  }

  // Show projects and let user pick
  console.log("Available projects:");
  for (let i = 0; i < projects.length; i++) {
    console.log(`  ${i + 1}. ${projects[i].name} (${projects[i].compiler})`);
  }
  console.log(`  ${projects.length + 1}. Create new project`);

  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question(`Select project [1-${projects.length + 1}]: `, async (answer: string) => {
    rl.close();
    const choice = parseInt(answer, 10);

    if (choice >= 1 && choice <= projects.length) {
      const project = projects[choice - 1];
      const config: ProjectConfig = {
        project_id: project.id,
        server_url: auth.server_url,
        main_file: project.mainFile || "main.tex",
        compiler: project.compiler || "pdflatex",
        ignore: ["*.aux", "*.log", "*.out", "*.synctex.gz", ".git", "node_modules", ".lightlatex"],
      };
      saveProjectConfig(config);
      console.log(`Connected to project "${project.name}" (${project.id})`);
      console.log("Config saved to .lightlatex/config.json");
      console.log("Run 'lightlatex pull' to download files.");
    } else if (choice === projects.length + 1) {
      const name = path.basename(process.cwd());
      const project = await client.createProject(name);
      const config: ProjectConfig = {
        project_id: project.id,
        server_url: auth.server_url,
        main_file: "main.tex",
        compiler: project.compiler || "pdflatex",
        ignore: ["*.aux", "*.log", "*.out", "*.synctex.gz", ".git", "node_modules", ".lightlatex"],
      };
      saveProjectConfig(config);
      console.log(`Created project "${name}" (${project.id})`);
      console.log("Run 'lightlatex pull' to download files.");
    } else {
      console.error("Invalid selection");
      process.exit(1);
    }
  });
}
