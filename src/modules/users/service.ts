import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { invalidateUserSessionCache } from "@/lib/session";

import type { UpdateRoleBody } from "./model";

// Exactly the columns the API exposes (no password hash).
const USER_COLUMNS = {
  id: user.id,
  name: user.name,
  email: user.email,
  image: user.image,
  role: user.role,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
};

export class UsersService {
  // ponytail: flat capped list; add cursor pagination when the table grows.
  async list(limit = 100) {
    return db
      .select(USER_COLUMNS)
      .from(user)
      .orderBy(asc(user.id))
      .limit(limit);
  }

  async setRole(userId: string, role: UpdateRoleBody["role"]) {
    const rows = await db
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning(USER_COLUMNS);

    const updated = rows[0];
    if (!updated) return null;

    // Role is cached inside the session blob; drop it so the change takes
    // effect immediately instead of after the 5-minute cache TTL.
    await invalidateUserSessionCache(userId);
    return updated;
  }
}

export const usersService = new UsersService();
