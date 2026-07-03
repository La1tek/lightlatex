export const COMPILERS = ["pdflatex", "xelatex", "lualatex"] as const;
export type Compiler = typeof COMPILERS[number];

export const PROJECT_ACCESS_ROLES = ["owner", "editor", "viewer"] as const;
export type ProjectRole = typeof PROJECT_ACCESS_ROLES[number];

export const COLLABORATOR_ROLES = ["viewer", "editor"] as const;
export type CollaboratorRole = typeof COLLABORATOR_ROLES[number];

export const BINARY_FILE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "pdf", "zip"]);
