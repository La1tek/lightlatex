import { db } from ".";

export async function bootstrapDatabase() {
  await db.execute(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT now(),
      last_login TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      compiler VARCHAR(20) DEFAULT 'pdflatex',
      main_file VARCHAR(255) DEFAULT 'main.tex',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
    CREATE TABLE IF NOT EXISTS files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path VARCHAR(500) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(project_id, path)
    );
    CREATE INDEX IF NOT EXISTS idx_files_project ON files(project_id);
    CREATE TABLE IF NOT EXISTS project_collaborators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL DEFAULT 'viewer',
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(project_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_project_collaborators_project ON project_collaborators(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_collaborators_user ON project_collaborators(user_id);
    CREATE TABLE IF NOT EXISTS project_cli_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) UNIQUE NOT NULL,
      token_prefix VARCHAR(16) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      last_used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_project_cli_tokens_project ON project_cli_tokens(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_cli_tokens_user ON project_cli_tokens(user_id);
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}
