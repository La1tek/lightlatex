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
    res.status(201).json(project);
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
    res.json(await updateProjectForOwner(p(req, "id"), req.userId!, req.body));
  } catch (err: any) {
    sendError(res, err);
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await deleteProjectForOwner(p(req, "id"), req.userId!);
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
