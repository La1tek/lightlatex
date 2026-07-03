import { boolean, integer, pgTable, uuid, varchar, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLogin: timestamp("last_login", { withTimezone: true }),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  compiler: varchar("compiler", { length: 20 }).default("pdflatex"),
  mainFile: varchar("main_file", { length: 255 }).default("main.tex"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_projects_user").on(table.userId),
]);

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  path: varchar("path", { length: 500 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_files_project").on(table.projectId),
  unique("unique_project_file").on(table.projectId, table.path),
]);

export const projectCollaborators = pgTable("project_collaborators", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_project_collaborators_project").on(table.projectId),
  index("idx_project_collaborators_user").on(table.userId),
  unique("unique_project_collaborator").on(table.projectId, table.userId),
]);

export const projectCliTokens = pgTable("project_cli_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
  tokenPrefix: varchar("token_prefix", { length: 16 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, (table) => [
  index("idx_project_cli_tokens_project").on(table.projectId),
  index("idx_project_cli_tokens_user").on(table.userId),
]);

export const projectComments = pgTable("project_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filePath: varchar("file_path", { length: 500 }),
  lineNumber: integer("line_number"),
  body: text("body").notNull(),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_project_comments_project").on(table.projectId),
  index("idx_project_comments_file").on(table.projectId, table.filePath),
]);

export const projectInvites = pgTable("project_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("viewer"),
  tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
  tokenPrefix: varchar("token_prefix", { length: 16 }).notNull(),
  maxUses: integer("max_uses").notNull().default(25),
  useCount: integer("use_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("idx_project_invites_project").on(table.projectId),
  index("idx_project_invites_hash").on(table.tokenHash),
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  collaborations: many(projectCollaborators),
  comments: many(projectComments),
  projectInvites: many(projectInvites),
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  files: many(files),
  collaborators: many(projectCollaborators),
  cliTokens: many(projectCliTokens),
  comments: many(projectComments),
  invites: many(projectInvites),
}));

export const filesRelations = relations(files, ({ one }) => ({
  project: one(projects, { fields: [files.projectId], references: [projects.id] }),
}));

export const projectCollaboratorsRelations = relations(projectCollaborators, ({ one }) => ({
  project: one(projects, { fields: [projectCollaborators.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectCollaborators.userId], references: [users.id] }),
}));

export const projectCliTokensRelations = relations(projectCliTokens, ({ one }) => ({
  project: one(projects, { fields: [projectCliTokens.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectCliTokens.userId], references: [users.id] }),
}));

export const projectCommentsRelations = relations(projectComments, ({ one }) => ({
  project: one(projects, { fields: [projectComments.projectId], references: [projects.id] }),
  author: one(users, { fields: [projectComments.authorId], references: [users.id] }),
}));

export const projectInvitesRelations = relations(projectInvites, ({ one }) => ({
  project: one(projects, { fields: [projectInvites.projectId], references: [projects.id] }),
  creator: one(users, { fields: [projectInvites.createdBy], references: [users.id] }),
}));
