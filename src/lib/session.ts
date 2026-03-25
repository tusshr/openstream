import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { session, user } from "@/db/schema";
import { extractIp, extractUserAgent } from "@/lib/audit";
import { generateId } from "@/lib/id";
import { redis } from "@/lib/redis";
import { generateToken } from "@/lib/token";

export type SessionWithUser = {
  session: typeof session.$inferSelect;
  user: typeof user.$inferSelect;
};

export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;
const CACHE_TTL_SEC = 5 * 60;

function cacheKey(token: string): string {
  return `session:${token}`;
}

export async function createSession(
  userId: string,
  request: Request,
): Promise<string> {
  const token = generateToken(32);
  const now = new Date();

  await db.insert(session).values({
    id: generateId(),
    token,
    userId,
    expiresAt: new Date(now.getTime() + SESSION_TTL_SEC * 1000),
    ipAddress: extractIp(request),
    userAgent: extractUserAgent(request),
    createdAt: now,
    updatedAt: now,
  });

  return token;
}

export async function getSession(
  token: string,
): Promise<SessionWithUser | null> {
  const cached = await redis.get(cacheKey(token));
  if (cached) {
    try {
      return JSON.parse(cached) as SessionWithUser;
    } catch {
      // corrupted cache entry — fall through to DB
    }
  }

  const rows = await db
    .select()
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(and(eq(session.token, token), gt(session.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const result: SessionWithUser = { session: row.session, user: row.user };
  await redis.send("SET", [
    cacheKey(token),
    JSON.stringify(result),
    "EX",
    String(CACHE_TTL_SEC),
  ]);

  return result;
}

export async function deleteSession(token: string): Promise<void> {
  await Promise.all([
    db.delete(session).where(eq(session.token, token)),
    redis.del(cacheKey(token)),
  ]);
}

export async function deleteUserSessions(userId: string): Promise<void> {
  const rows = await db
    .delete(session)
    .where(eq(session.userId, userId))
    .returning({ token: session.token });

  if (rows.length > 0) {
    await Promise.all(rows.map((r) => redis.del(cacheKey(r.token))));
  }
}

export async function invalidateUserSessionCache(
  userId: string,
): Promise<void> {
  const rows = await db
    .select({ token: session.token })
    .from(session)
    .where(eq(session.userId, userId));

  if (rows.length > 0) {
    await Promise.all(rows.map((r) => redis.del(cacheKey(r.token))));
  }
}
