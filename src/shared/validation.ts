import { COLLABORATOR_ROLES, CollaboratorRole, COMPILERS, Compiler } from "./constants";

export function getCompiler(value: unknown): Compiler {
  const compiler = typeof value === "string" && value.trim() ? value.trim() : "pdflatex";
  if (!COMPILERS.includes(compiler as Compiler)) {
    throw new Error("Unsupported compiler");
  }
  return compiler as Compiler;
}

export function isSafeMainFile(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.endsWith(".tex")
    && !value.startsWith("/")
    && !value.split(/[\\/]+/).includes("..");
}

export function isSafeProjectRelativePath(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 500
    && !value.startsWith("/")
    && !value.split(/[\\/]+/).includes("..");
}

export function validateCollaboratorRole(value: unknown): CollaboratorRole {
  const role = typeof value === "string" ? value.trim() : "viewer";
  if (!COLLABORATOR_ROLES.includes(role as CollaboratorRole)) {
    throw new Error("Role must be viewer or editor");
  }
  return role as CollaboratorRole;
}
