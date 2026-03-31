import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { generateId } from "@/lib/id";
import { redis } from "@/lib/redis";

import { callApp } from "./helpers/request";

let dbUp = false;
try {
  await db.execute(sql`select 1`);
  dbUp = true;
} catch {
  dbUp = false;
}

const educatorId = generateId();
const blankEducatorId = generateId();

async function forge(id: string): Promise<string> {
  const token = `itest-${id}`;
  await redis.send("SET", [
    `session:${token}`,
    JSON.stringify({
      session: { id: `s-${token}`, token, userId: id },
      user: {
        id,
        name: "Ada Lovelace",
        email: `${id}@itest.local`,
        role: "educator",
      },
    }),
    "EX",
    "300",
  ]);
  return token;
}
const json = (token: string) => ({
  "content-type": "application/json",
  "x-requested-with": "openstream",
  cookie: `session_token=${token}`,
});

describe.skipIf(!dbUp)("educator profiles (real DB)", () => {
  beforeAll(async () => {
    const now = new Date();
    await db.insert(user).values(
      [educatorId, blankEducatorId].map((id) => ({
        id,
        name: "Ada Lovelace",
        email: `${id}@itest.local`,
        role: "educator" as const,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })),
    );
  });

  afterAll(async () => {
    await db.delete(user).where(eq(user.id, educatorId)); // cascades the profile
    await db.delete(user).where(eq(user.id, blankEducatorId));
  });

  test("upsert is self-managed; profile is public; PUT replaces fields", async () => {
    const educator = await forge(educatorId);

    // Create.
    const created = await callApp<{
      data: { bio: string | null; name: string };
    }>("/api/educators/me", {
      method: "PUT",
      headers: json(educator),
      body: JSON.stringify({
        bio: "I teach maths.",
        headline: "Mathematician",
      }),
    });
    expect(created.status).toBe(200);
    expect(created.body.data.bio).toBe("I teach maths.");
    expect(created.body.data.name).toBe("Ada Lovelace"); // joined from user

    // Public read (anonymous).
    const pub = await callApp<{ data: { headline: string | null } }>(
      `/api/educators/${educatorId}`,
      { method: "GET" },
    );
    expect(pub.status).toBe(200);
    expect(pub.body.data.headline).toBe("Mathematician");

    // PUT-replace: omitting bio clears it.
    await callApp("/api/educators/me", {
      method: "PUT",
      headers: json(educator),
      body: JSON.stringify({ headline: "Mathematician & educator" }),
    });
    const after = await callApp<{ data: { bio: string | null } }>(
      "/api/educators/me",
      {
        method: "GET",
        headers: { cookie: `session_token=${educator}` },
      },
    );
    expect(after.body.data.bio).toBeNull();

    // An educator with no profile yet → 404.
    const blank = await callApp(`/api/educators/${blankEducatorId}`, {
      method: "GET",
    });
    expect(blank.status).toBe(404);
  });
});
