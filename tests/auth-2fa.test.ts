import { afterEach, describe, expect, mock, test } from "bun:test";

import { redis } from "@/lib/redis";

import { __resetRedisMock } from "./setup";

// A stolen pending-2FA token must not allow unlimited code guesses within its
// TTL. After MAX_2FA_ATTEMPTS (5) failures the pending token is invalidated.

const tfRow = {
  id: "tf1",
  userId: "user-1",
  secret: "SECRET",
  backupCodes: "[]",
};

mock.module("@/db", () => {
  const builder = {
    from: () => builder,
    where: () => builder,
    limit: () => Promise.resolve([tfRow]),
  };
  return {
    db: {
      select: () => builder,
      update: () => ({
        set: () => ({ where: () => Promise.resolve(undefined) }),
      }),
      insert: () => ({ values: () => Promise.resolve(undefined) }),
    },
  };
});

// Force every code to be rejected so we exercise the failure/cap path.
mock.module("@/lib/totp", () => ({
  verifyTotp: async () => false,
  generateTotpSecret: () => "SECRET",
  totpUri: () => "otpauth://totp/stub",
}));

const { authService } = await import("@/modules/auth/service");

const PENDING = "pending-token-xyz";
const req = new Request("http://localhost/2fa");

afterEach(() => __resetRedisMock());

async function seedPendingToken(): Promise<void> {
  await redis.send("SET", [`2fa_pending:${PENDING}`, "user-1", "EX", "300"]);
}

describe("verifyPendingTotp brute-force cap", () => {
  test("invalidates the pending token after 5 failed codes", async () => {
    await seedPendingToken();

    for (let i = 0; i < 4; i++) {
      await expect(
        authService.verifyPendingTotp(PENDING, "000000", req),
      ).rejects.toMatchObject({ code: "TOTP_INVALID" });
    }

    // 5th failure trips the cap and kills the pending token.
    await expect(
      authService.verifyPendingTotp(PENDING, "000000", req),
    ).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });

    expect(await redis.get(`2fa_pending:${PENDING}`)).toBeNull();

    // Token is gone → further attempts see an expired session, not more guesses.
    await expect(
      authService.verifyPendingTotp(PENDING, "000000", req),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
});
