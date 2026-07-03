export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  projectsDir: process.env.PROJECTS_DIR || "./data/projects",
  upload: {
    maxZipBytes: Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024,
    maxImageBytes: Number(process.env.MAX_IMAGE_UPLOAD_MB || 20) * 1024 * 1024,
    maxBackupBytes: Number(process.env.MAX_BACKUP_UPLOAD_MB || 1024) * 1024 * 1024,
  },
  quotas: {
    storagePerUserMB: Number(process.env.STORAGE_QUOTA_MB || 0),
    compileTimeoutMs: Number(process.env.COMPILE_TIMEOUT_MS || 30000),
  },
};
