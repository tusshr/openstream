import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

mock.module("@/modules/jobs", () => ({ enqueueEmail: async () => {} }));

const { db } = await import("@/db");
const { user, account } = await import("@/db/schema");
const { postJson } = await import("./helpers/request");

let dbUp = false;
try {
  await db.execute(sql`select 1`);
  dbUp = true;
} catch {
  dbUp = false;
}

const EMAIL = "itest-c1@openstream.test";
const PASSWORD = "Password123!";

describe.skipIf(!dbUp)("auth sign-up → sign-in (real DB)", () => {
  beforeAll(async () => {
    await db.delete(user).where(eq(user.email, EMAIL));
  });
  afterAll(async () => {
    await db.delete(user).where(eq(user.email, EMAIL));
  });

  test("a signed-up, verified user can sign in", async () => {
    const signUp = await postJson("/api/auth/sign-up", {
      email: EMAIL,
      password: PASSWORD,
      name: "Integration Test",
    });
    expect(signUp.status).toBe(201);

    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, EMAIL))
      .limit(1);
    expect(users).toHaveLength(1);

    const accounts = await db
      .select()
      .from(account)
      .where(eq(account.userId, users[0]!.id))
      .limit(1);
    expect(accounts).toHaveLength(1);

    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, users[0]!.id));

    const signIn = await postJson<{ data: { user: { email: string } } }>(
      "/api/auth/sign-in",
      { email: EMAIL, password: PASSWORD },
    );
    expect(signIn.status).toBe(200);
    expect(signIn.body.data.user.email).toBe(EMAIL);
    expect(signIn.headers.get("set-cookie") ?? "").toContain("session_token=");
  });
});
