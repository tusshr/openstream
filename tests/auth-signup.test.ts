import { beforeEach, describe, expect, mock, test } from "bun:test";

import { auditLog, user, verification } from "@/db/schema";

// signUp must persist the user with an argon2id-hashed password on the user row
// (the separate credential `account` table was removed). It must normalize the
// email, reference the real user id from the verification + audit rows, and
// never fail the request just because the verification email couldn't enqueue.
// These tests pin that contract without needing a live Postgres.

type Insert = { table: unknown; values: Record<string, unknown> };
type FakeDb = {
  select: () => ReturnType<typeof thenableArray>;
  insert: (table: unknown) => {
    values: (values: Record<string, unknown>) => Promise<undefined>;
  };
  delete: () => { where: () => Promise<undefined> };
  transaction: (cb: (tx: FakeDb) => Promise<unknown>) => Promise<unknown>;
};

const state = {
  existingUsers: [] as Array<{ id: string }>,
  inserts: [] as Insert[],
  txCalls: 0,
  enqueueShouldThrow: false,
  enqueued: [] as unknown[],
};

function thenableArray<T>(rows: T[]) {
  // A minimal drizzle-like query builder: chainable and awaitable to `rows`.
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    limit: () => Promise.resolve(rows),
    then: (resolve: (v: T[]) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
  return builder;
}

const fakeDb: FakeDb = {
  select: () => thenableArray(state.existingUsers),
  insert: (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      state.inserts.push({ table, values });
      return Promise.resolve(undefined);
    },
  }),
  delete: () => ({ where: () => Promise.resolve(undefined) }),
  transaction: async (cb: (tx: typeof fakeDb) => Promise<unknown>) => {
    state.txCalls += 1;
    return cb(fakeDb);
  },
};

mock.module("@/db", () => ({ db: fakeDb }));
mock.module("@/modules/jobs", () => ({
  enqueueEmail: async (payload: unknown) => {
    if (state.enqueueShouldThrow) throw new Error("queue unavailable");
    state.enqueued.push(payload);
  },
}));

const { authService, AuthError } = await import("@/modules/auth/service");

const insertFor = (table: unknown) =>
  state.inserts.find((i) => i.table === table);

beforeEach(() => {
  state.existingUsers = [];
  state.inserts = [];
  state.txCalls = 0;
  state.enqueueShouldThrow = false;
  state.enqueued = [];
});

describe("authService.signUp", () => {
  test("creates a single user row with a hashed password", async () => {
    await authService.signUp("New.User@Example.com", "password123", "New User");

    const userInsert = insertFor(user);
    expect(userInsert).toBeDefined();

    // Password hash lives on the user row itself (no separate account table).
    expect(typeof userInsert!.values.password).toBe("string");
    expect(userInsert!.values.password).not.toBe("password123");

    // Email is normalized to lowercase on the user row.
    expect(userInsert!.values.email).toBe("new.user@example.com");
    expect(userInsert!.values.emailVerified).toBe(false);
  });

  test("verification token and audit row reference the real user id", async () => {
    await authService.signUp("a@b.com", "password123", "A B");

    const userId = insertFor(user)!.values.id as string;

    const verificationInsert = insertFor(verification);
    expect(verificationInsert).toBeDefined();
    const payload = JSON.parse(verificationInsert!.values.value as string);
    expect(payload).toEqual({ type: "email-verify", userId });

    const auditInsert = insertFor(auditLog);
    expect(auditInsert!.values.actorId).toBe(userId);
    expect(auditInsert!.values.resourceId).toBe(userId);
  });

  test("rejects a duplicate email without writing anything", async () => {
    state.existingUsers = [{ id: "existing-id" }];

    await expect(
      authService.signUp("dupe@b.com", "password123", "Dupe"),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });

    expect(state.inserts).toHaveLength(0);
  });

  test("succeeds even if the verification email cannot be enqueued", async () => {
    state.enqueueShouldThrow = true;

    // The user is already committed; a queue outage must not fail the request.
    await expect(
      authService.signUp("queue@b.com", "password123", "Queue User"),
    ).resolves.toBeUndefined();

    expect(insertFor(user)).toBeDefined();
    expect(state.enqueued).toHaveLength(0);
  });

  test("AuthError is exported and shaped as expected", () => {
    const err = new AuthError("EMAIL_TAKEN", "taken");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("EMAIL_TAKEN");
  });
});
