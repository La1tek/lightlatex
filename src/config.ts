export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  projectsDir: process.env.PROJECTS_DIR || "./data/projects",
};
