import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../auth/middleware";
import { sendError } from "./http";
import { p } from "../utils";
import {
  createProjectForUser,
  deleteProjectForOwner,
  getProjectForUser,
  listProjectsForUser,
  searchProjectFiles,
  updateProjectForOwner,
} from "../services/projects";
import {
  listProjectCollaborators,
  removeProjectCollaborator,
  updateProjectCollaborator,
  upsertProjectCollaborator,
} from "../services/collaborators";
import {
  getProjectCliToken,
  regenerateProjectCliToken,
  revokeProjectCliToken,
} from "../services/cliTokens";
import {
  createProjectComment,
  deleteProjectComment,
  listProjectComments,
  resolveProjectComment,
  updateProjectComment,
} from "../services/comments";
import {
  acceptProjectInvite,
  createProjectInvite,
  listProjectInvites,
  revokeProjectInvite,
} from "../services/invites";
import { logAuditEvent } from "../services/audit";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listProjectsForUser(req.userId!));
  } catch (err: any) {
    sendError(res, err, 500);
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const project = await createProjectForUser(req.userId!, req.body);
    await logAuditEvent({
      userId: req.userId!,
      action: "project.create",
      resourceType: "project",
      resourceId: project.id,
      metadata: { name: project.name, compiler: project.compiler },
    });
    res.status(201).json(project);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.post("/invites/accept", async (req: AuthRequest, res: Response) => {
  try {
    const result = await acceptProjectInvite(String(req.body?.token || ""), req.userId!);
    await logAuditEvent({
      userId: req.userId!,
      action: "invite.accept",
      resourceType: "project",
      resourceId: result.projectId,
      metadata: { role: result.role },
    });
    res.json(result);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getProjectForUser(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err, 404);
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const project = await updateProjectForOwner(p(req, "id"), req.userId!, req.body);
    await logAuditEvent({
      userId: req.userId!,
      action: "project.update",
      resourceType: "project",
      resourceId: project.id,
      metadata: { name: project.name, compiler: project.compiler, mainFile: project.mainFile },
    });
    res.json(project);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const projectId = p(req, "id");
    await deleteProjectForOwner(projectId, req.userId!);
    await logAuditEvent({
      userId: req.userId!,
      action: "project.delete",
      resourceType: "project",
      resourceId: projectId,
    });
    res.json({ ok: true });
  } catch (err: any) {
    sendError(res, err, 404);
  }
});

router.get("/:id/collaborators", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listProjectCollaborators(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err, 404);
  }
});

router.get("/:id/cli-token", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getProjectCliToken(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err, 404);
  }
});

router.post("/:id/cli-token/regenerate", async (req: AuthRequest, res: Response) => {
  try {
    const projectId = p(req, "id");
    const token = await regenerateProjectCliToken(projectId, req.userId!);
    await logAuditEvent({
      userId: req.userId!,
      action: "cli-token.regenerate",
      resourceType: "project",
      resourceId: projectId,
      metadata: { tokenPrefix: token.tokenPrefix },
    });
    res.status(201).json(token);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.delete("/:id/cli-token", async (req: AuthRequest, res: Response) => {
  try {
    const projectId = p(req, "id");
    await revokeProjectCliToken(projectId, req.userId!);
    await logAuditEvent({
      userId: req.userId!,
      action: "cli-token.revoke",
      resourceType: "project",
      resourceId: projectId,
    });
    res.json({ ok: true });
  } catch (err: any) {
    sendError(res, err, 404);
  }
});

router.get("/:id/comments", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listProjectComments(p(req, "id"), req.userId!, {
      filePath: req.query.filePath,
      includeResolved: req.query.includeResolved,
    }));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.post("/:id/comments", async (req: AuthRequest, res: Response) => {
  try {
    const projectId = p(req, "id");
    const comment = await createProjectComment(projectId, req.userId!, req.body);
    await logAuditEvent({
      userId: req.userId!,
      action: "comment.create",
      resourceType: "project",
      resourceId: projectId,
      metadata: { filePath: comment.filePath, lineNumber: comment.lineNumber },
    });
    res.status(201).json(comment);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.put("/:id/comments/:commentId", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await updateProjectComment(p(req, "id"), req.userId!, String(req.params.commentId), req.body));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.post("/:id/comments/:commentId/resolve", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await resolveProjectComment(
      p(req, "id"),
      req.userId!,
      String(req.params.commentId),
      req.body?.resolved !== false,
    ));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.delete("/:id/comments/:commentId", async (req: AuthRequest, res: Response) => {
  try {
    await deleteProjectComment(p(req, "id"), req.userId!, String(req.params.commentId));
    res.json({ ok: true });
  } catch (err: any) {
    sendError(res, err, 404);
  }
});

router.get("/:id/invites", async (req: AuthRequest, res: Response) => {
  try {
    res.json(await listProjectInvites(p(req, "id"), req.userId!));
  } catch (err: any) {
    sendError(res, err, 404);
  }
});

router.post("/:id/invites", async (req: AuthRequest, res: Response) => {
  try {
    const projectId = p(req, "id");
    const invite = await createProjectInvite(projectId, req.userId!, req.body);
    await logAuditEvent({
      userId: req.userId!,
      action: "invite.create",
      resourceType: "project",
      resourceId: projectId,
      metadata: { role: invite.role, tokenPrefix: invite.tokenPrefix, maxUses: invite.maxUses },
    });
    res.status(201).json(invite);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.delete("/:id/invites/:inviteId", async (req: AuthRequest, res: Response) => {
  try {
    const projectId = p(req, "id");
    const invite = await revokeProjectInvite(projectId, req.userId!, String(req.params.inviteId));
    await logAuditEvent({
      userId: req.userId!,
      action: "invite.revoke",
      resourceType: "project",
      resourceId: projectId,
      metadata: { inviteId: invite.id },
    });
    res.json(invite);
  } catch (err: any) {
    sendError(res, err, 404);
  }
});

router.post("/:id/collaborators", async (req: AuthRequest, res: Response) => {
  try {
    const result = await upsertProjectCollaborator(p(req, "id"), req.userId!, req.body);
    res.status(result.status).json(result.collaborator);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.put("/:id/collaborators/:collaboratorId", async (req: AuthRequest, res: Response) => {
  try {
    const updated = await updateProjectCollaborator(p(req, "id"), req.userId!, String(req.params.collaboratorId), req.body);
    res.json(updated);
  } catch (err: any) {
    sendError(res, err);
  }
});

router.delete("/:id/collaborators/:collaboratorId", async (req: AuthRequest, res: Response) => {
  try {
    await removeProjectCollaborator(p(req, "id"), req.userId!, String(req.params.collaboratorId));
    res.json({ ok: true });
  } catch (err: any) {
    sendError(res, err, 404);
  }
});

router.get("/:id/search", async (req: AuthRequest, res: Response) => {
  try {
    const query = (req.query.q as string || "").trim();
    res.json(await searchProjectFiles(p(req, "id"), req.userId!, query));
  } catch (err: any) {
    sendError(res, err);
  }
});

export default router;
