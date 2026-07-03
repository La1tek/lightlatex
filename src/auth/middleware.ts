import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "./service";
import { authenticateCliToken } from "../services/cliTokens";

export interface AuthRequest extends Request {
  userId?: string;
  cliProjectId?: string;
}

function isCliTokenInScope(originalUrl: string, projectId: string) {
  return originalUrl.startsWith(`/api/projects/${projectId}/`);
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.slice(7);
  try {
    if (token.startsWith("ltx_")) {
      const cliAuth = await authenticateCliToken(token);
      if (!isCliTokenInScope(req.originalUrl, cliAuth.projectId)) {
        return res.status(403).json({ error: "CLI token is scoped to a different project" });
      }
      req.userId = cliAuth.userId;
      req.cliProjectId = cliAuth.projectId;
      return next();
    }
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Unauthorized" });
  }
}
