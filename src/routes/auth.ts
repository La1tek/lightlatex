import { Router, Request, Response } from "express";
import { register, login, refreshTokens, logout } from "../auth/service";
import { AuthRequest, authMiddleware } from "../auth/middleware";
import { db } from "../db";
import { users } from "../db/schema";
import { count, eq } from "drizzle-orm";
import { config } from "../config";
import { logAuditEvent } from "../services/audit";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const registrationMode = config.auth.registrationMode;
    if (registrationMode === "closed") {
      return res.status(403).json({ error: "Registration is disabled on this server" });
    }
    if (registrationMode === "first-user") {
      const userCount = (await db.select({ count: count() }).from(users))[0].count;
      if (userCount > 0) return res.status(403).json({ error: "Registration is limited to the first user" });
    }

    const result = await register(email, password, name);
    await logAuditEvent({
      userId: result.user.id,
      action: "auth.register",
      resourceType: "user",
      resourceId: result.user.id,
      metadata: { email: result.user.email },
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const result = await login(email, password);
    await logAuditEvent({
      userId: result.user.id,
      action: "auth.login",
      resourceType: "user",
      resourceId: result.user.id,
      metadata: { email: result.user.email },
    });
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });
    const result = await refreshTokens(refreshToken);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await logout(refreshToken);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, req.userId!)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

export default router;
