import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { users, sessions } from "../db/schema";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "change-me-in-production") {
    console.warn("⚠️  JWT_SECRET is not set or is default — using for development only");
    return secret || "dev-secret-do-not-use-in-production";
  }
  return secret;
}

export async function register(email: string, password: string, name?: string) {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    throw new Error("Email already registered");
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const [user] = await db.insert(users).values({ email, password: hash, name }).returning();

  const { accessToken, refreshToken } = await createTokens(user.id);
  return { user: { id: user.id, email: user.email, name: user.name }, accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new Error("Invalid credentials");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error("Invalid credentials");

  await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));

  const { accessToken, refreshToken } = await createTokens(user.id);
  return { user: { id: user.id, email: user.email, name: user.name }, accessToken, refreshToken };
}

export async function createTokens(userId: string) {
  const accessToken = jwt.sign({ sub: userId, type: "access" }, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshToken = uuidv4();
  const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await db.insert(sessions).values({
    userId,
    tokenHash: refreshTokenHash,
    expiresAt,
  });

  return { accessToken, refreshToken };
}

export async function refreshTokens(refreshToken: string) {
  const allSessions = await db.select().from(sessions);
  for (const session of allSessions) {
    const match = await bcrypt.compare(refreshToken, session.tokenHash);
    if (match) {
      if (session.expiresAt < new Date()) {
        await db.delete(sessions).where(eq(sessions.id, session.id));
        throw new Error("Refresh token expired");
      }
      await db.delete(sessions).where(eq(sessions.id, session.id));
      return await createTokens(session.userId);
    }
  }
  throw new Error("Invalid refresh token");
}

export async function logout(refreshToken: string) {
  const allSessions = await db.select().from(sessions);
  for (const session of allSessions) {
    const match = await bcrypt.compare(refreshToken, session.tokenHash);
    if (match) {
      await db.delete(sessions).where(eq(sessions.id, session.id));
      return;
    }
  }
}

export function verifyAccessToken(token: string): { sub: string } {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string; type: string };
    if (payload.type !== "access") throw new Error("Invalid token type");
    return payload;
  } catch {
    throw new Error("Invalid or expired access token");
  }
}
