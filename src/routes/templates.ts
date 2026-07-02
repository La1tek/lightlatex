import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import fs from "fs";
import path from "path";
import { writeFile } from "../storage/fs";
import { p } from "../utils";

const router = Router();


interface TemplateFile {
  path: string;
  content: string;
}

interface Template {
  name: string;
  description: string;
  files: TemplateFile[];
}

function getTemplatesDir(): string {
  const candidates = [
    path.join(__dirname, "..", "templates"),
    path.join(process.cwd(), "src", "templates"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found || candidates[0];
}

function getAvailableTemplates(): Template[] {
  const templates: Template[] = [];
  const dirs = ["article", "book", "beamer"];
  const templatesDir = getTemplatesDir();

  for (const dir of dirs) {
    const templateDir = path.join(templatesDir, dir);
    if (!fs.existsSync(templateDir)) continue;

    const metaPath = path.join(templateDir, "meta.json");
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf-8")) : {};
    const files: TemplateFile[] = [];

    const collectFiles = (dirPath: string, base: string = "") => {
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          collectFiles(path.join(dirPath, entry.name), rel);
        } else if (entry.name.endsWith(".tex") || entry.name.endsWith(".bib") || entry.name.endsWith(".sty")) {
          files.push({
            path: rel,
            content: fs.readFileSync(path.join(dirPath, entry.name), "utf-8"),
          });
        }
      }
    };

    collectFiles(templateDir);
    if (files.length > 0) {
      templates.push({
        name: dir,
        description: meta.description || `${dir} template`,
        files,
      });
    }
  }

  return templates;
}

router.get("/", (_req: AuthRequest, res: Response) => {
  const templates = getAvailableTemplates().map(t => ({
    name: t.name,
    description: t.description,
    fileCount: t.files.length,
  }));
  res.json(templates);
});

router.get("/:name", (req: AuthRequest, res: Response) => {
  const template = getAvailableTemplates().find(t => t.name === p(req, "name"));
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json(template);
});

export async function applyTemplate(projectId: string, templateName: string): Promise<void> {
  const template = getAvailableTemplates().find(t => t.name === templateName);
  if (!template) throw new Error("Template not found");

  for (const file of template.files) {
    await writeFile(projectId, file.path, file.content);
  }
}

export default router;
