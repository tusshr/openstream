import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { account, twoFactor, user, verification } from "@/db/schema";
import { env } from "@/env";
import { audit } from "@/lib/audit";
import { generateId } from "@/lib/id";
import { logger } from "@/lib/logger";
import { hashPassword, verifyPassword } from "@/lib/password";
import { redis } from "@/lib/redis";
import {
  createSession,
  deleteSession,
  deleteUserSessions,
  invalidateUserSessionCache,
} from "@/lib/session";
import { generateToken } from "@/lib/token";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { enqueueEmail } from "@/modules/jobs";

const APP_URL = env.APP_URL ?? "http://localhost:3000";
const PENDING_2FA_TTL_SEC = 60 * 5;
const BACKUP_CODE_COUNT = 10;
const MAX_2FA_ATTEMPTS = 5;

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

type UserRow = typeof user.$inferSelect;

type SignInResult =
  | { user: UserRow; token: string }
  | { requiresTwoFactor: true; pendingToken: string };

// ---------------------------------------------------------------------------
// Verification token helpers
// ---------------------------------------------------------------------------

type VerificationPayload =
  | { type: "email-verify"; userId: string }
  | { type: "password-reset"; userId: string }
  | { type: "email-change"; userId: string; newEmail: string };

async function createVerificationToken(
  payload: VerificationPayload,
  ttlMs: number,
): Promise<string> {
  const token = generateToken(32);
  await db.insert(verification).values({
    id: generateId(),
    identifier: token,
    value: JSON.stringify(payload),
    expiresAt: new Date(Date.now() + ttlMs),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return token;
}

async function consumeVerificationToken(
  token: string,
  expectedType: VerificationPayload["type"],
): Promise<VerificationPayload> {
  const rows = await db
    .select()
    .from(verification)
    .where(
      and(
        eq(verification.identifier, token),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row)
    throw new AuthError("INVALID_TOKEN", "Token is invalid or expired.");

  let payload: VerificationPayload;
  try {
    payload = JSON.parse(row.value) as VerificationPayload;
  } catch {
    throw new AuthError("INVALID_TOKEN", "Token is invalid or expired.");
  }

  if (payload.type !== expectedType) {
    throw new AuthError("INVALID_TOKEN", "Token is invalid or expired.");
  }

  await db.delete(verification).where(eq(verification.id, row.id));
  return payload;
}

// ---------------------------------------------------------------------------
// Backup code helpers
// ---------------------------------------------------------------------------

async function hashBackupCode(code: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const BACKUP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateBackupCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => BACKUP_CHARS[b % BACKUP_CHARS.length]!)
    .join("");
}

async function generateBackupCodes(): Promise<{
  plain: string[];
  hashes: string[];
}> {
  const plain = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  const hashes = await Promise.all(plain.map(hashBackupCode));
  return { plain, hashes };
}

async function failTwoFactorAttempt(
  pendingToken: string,
  message: string,
): Promise<never> {
  const key = `2fa_attempts:${pendingToken}`;
  const attempts = Number(await redis.send("INCR", [key]));
  if (attempts === 1) {
    await redis.send("EXPIRE", [key, String(PENDING_2FA_TTL_SEC)]);
  }
  if (attempts >= MAX_2FA_ATTEMPTS) {
    await redis.del(`2fa_pending:${pendingToken}`);
    await redis.del(key);
    throw new AuthError(
      "TOO_MANY_ATTEMPTS",
      "Too many invalid codes. Please sign in again.",
    );
  }
  throw new AuthError("TOTP_INVALID", message);
}

// ---------------------------------------------------------------------------
// Auth service
// ---------------------------------------------------------------------------

export class AuthService {
  async signUp(email: string, password: string, name: string): Promise<void> {
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new AuthError(
        "EMAIL_TAKEN",
        "An account with this email already exists.",
      );
    }

    const hash = await hashPassword(password);
    const now = new Date();
    const userId = generateId();

    await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id: userId,
        name,
        email: email.toLowerCase(),
        emailVerified: false,
        role: "user",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(account).values({
        id: generateId(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hash,
        createdAt: now,
        updatedAt: now,
      });
    });

    const token = await createVerificationToken(
      { type: "email-verify", userId },
      24 * 60 * 60 * 1000,
    );

    try {
      await enqueueEmail({
        kind: "verification",
        to: email,
        name,
        url: `${APP_URL}/verify-email?token=${token}`,
      });
    } catch (error) {
      logger.error(
        { err: error, userId },
        "sign-up: verification email enqueue failed",
      );
    }

    await audit({
      actorId: userId,
      action: "user.sign-up",
      resourceType: "user",
      resourceId: userId,
    });
  }

  async signIn(
    email: string,
    password: string,
    request: Request,
  ): Promise<SignInResult> {
    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    const found = users[0];

    const dummyHash =
      "$argon2id$v=19$m=65536,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const credentials = found
      ? await db
          .select({ password: account.password })
          .from(account)
          .where(
            and(
              eq(account.userId, found.id),
              eq(account.providerId, "credential"),
            ),
          )
          .limit(1)
      : [];

    const stored = credentials[0]?.password || dummyHash;
    let valid = false;
    try {
      valid = await verifyPassword(password, stored);
    } catch {
      valid = false;
    }

    if (!found || !valid) {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid email or password.");
    }

    if (!found.emailVerified) {
      throw new AuthError(
        "EMAIL_NOT_VERIFIED",
        "Please verify your email before signing in.",
      );
    }

    const tfRows = await db
      .select()
      .from(twoFactor)
      .where(eq(twoFactor.userId, found.id))
      .limit(1);

    if (tfRows.length > 0) {
      const pendingToken = generateToken(16);
      await redis.send("SET", [
        `2fa_pending:${pendingToken}`,
        found.id,
        "EX",
        String(PENDING_2FA_TTL_SEC),
      ]);
      return { requiresTwoFactor: true, pendingToken };
    }

    const token = await createSession(found.id, request);

    await audit({
      actorId: found.id,
      action: "user.sign-in",
      resourceType: "session",
      resourceId: token,
      request,
    });

    return { user: found, token };
  }

  async signOut(sessionToken: string, userId: string): Promise<void> {
    await deleteSession(sessionToken);
    await audit({
      actorId: userId,
      action: "user.sign-out",
      resourceType: "session",
      resourceId: sessionToken,
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const payload = await consumeVerificationToken(token, "email-verify");
    await db
      .update(user)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(user.id, payload.userId));
    await invalidateUserSessionCache(payload.userId);
  }

  async resendVerification(email: string): Promise<void> {
    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    const found = users[0];
    if (!found || found.emailVerified) return;

    const token = await createVerificationToken(
      { type: "email-verify", userId: found.id },
      24 * 60 * 60 * 1000,
    );

    await enqueueEmail({
      kind: "verification",
      to: email,
      name: found.name,
      url: `${APP_URL}/verify-email?token=${token}`,
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const users = await db
      .select()
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);

    const found = users[0];
    if (!found) return;

    const token = await createVerificationToken(
      { type: "password-reset", userId: found.id },
      60 * 60 * 1000,
    );

    await enqueueEmail({
      kind: "reset-password",
      to: email,
      name: found.name,
      url: `${APP_URL}/reset-password?token=${token}`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const payload = await consumeVerificationToken(token, "password-reset");
    const hash = await hashPassword(newPassword);

    await db
      .update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(
        and(
          eq(account.userId, payload.userId),
          eq(account.providerId, "credential"),
        ),
      );

    await deleteUserSessions(payload.userId);

    await audit({
      actorId: payload.userId,
      action: "user.password-reset",
      resourceType: "user",
      resourceId: payload.userId,
    });
  }

  async requestEmailChange(userId: string, newEmail: string): Promise<void> {
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, newEmail.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new AuthError("EMAIL_TAKEN", "This email is already in use.");
    }

    const users = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const found = users[0];
    if (!found) throw new AuthError("NOT_FOUND", "User not found.");

    const token = await createVerificationToken(
      { type: "email-change", userId, newEmail: newEmail.toLowerCase() },
      24 * 60 * 60 * 1000,
    );

    await enqueueEmail({
      kind: "change-email",
      to: found.email,
      name: found.name,
      newEmail,
      url: `${APP_URL}/confirm-email-change?token=${token}`,
    });
  }

  async confirmEmailChange(token: string): Promise<void> {
    const payload = (await consumeVerificationToken(
      token,
      "email-change",
    )) as Extract<VerificationPayload, { type: "email-change" }>;
    await db
      .update(user)
      .set({ email: payload.newEmail, updatedAt: new Date() })
      .where(eq(user.id, payload.userId));
    await invalidateUserSessionCache(payload.userId);
  }

  async setupTotp(
    userId: string,
    email: string,
  ): Promise<{ secret: string; uri: string }> {
    const secret = generateTotpSecret();
    await redis.send("SET", [
      `2fa_setup:${userId}`,
      secret,
      "EX",
      String(10 * 60),
    ]);
    return { secret, uri: totpUri(secret, email, "OpenStream") };
  }

  async enableTotp(userId: string, code: string): Promise<string[]> {
    const secret = await redis.get(`2fa_setup:${userId}`);
    if (!secret) {
      throw new AuthError(
        "TOTP_SETUP_EXPIRED",
        "Setup session expired. Please start over.",
      );
    }

    const valid = await verifyTotp(secret, code);
    if (!valid)
      throw new AuthError("TOTP_INVALID", "Invalid authenticator code.");

    const { plain, hashes } = await generateBackupCodes();

    await db
      .insert(twoFactor)
      .values({
        id: generateId(),
        userId,
        secret,
        backupCodes: JSON.stringify(hashes),
      })
      .onConflictDoUpdate({
        target: twoFactor.userId,
        set: { secret, backupCodes: JSON.stringify(hashes) },
      });

    await redis.del(`2fa_setup:${userId}`);
    return plain;
  }

  async verifyPendingTotp(
    pendingToken: string,
    code: string,
    request: Request,
  ): Promise<{ user: UserRow; token: string }> {
    const userId = await redis.get(`2fa_pending:${pendingToken}`);
    if (!userId) {
      throw new AuthError(
        "INVALID_TOKEN",
        "Two-factor session expired. Please sign in again.",
      );
    }

    const tfRows = await db
      .select()
      .from(twoFactor)
      .where(eq(twoFactor.userId, userId))
      .limit(1);

    const tf = tfRows[0];
    if (!tf) throw new AuthError("INVALID_TOKEN", "Two-factor not configured.");

    const valid = await verifyTotp(tf.secret, code);
    if (!valid)
      await failTwoFactorAttempt(pendingToken, "Invalid authenticator code.");

    const fresh = await redis.send("SET", [
      `2fa_used:${userId}:${code}`,
      "1",
      "EX",
      "90",
      "NX",
    ]);
    if (fresh === null) {
      throw new AuthError(
        "TOTP_INVALID",
        "That code was already used. Wait for the next one.",
      );
    }

    await redis.del(`2fa_pending:${pendingToken}`);
    await redis.del(`2fa_attempts:${pendingToken}`);

    const users = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const found = users[0];
    if (!found) throw new AuthError("NOT_FOUND", "User not found.");

    const token = await createSession(found.id, request);

    await audit({
      actorId: found.id,
      action: "user.sign-in",
      resourceType: "session",
      resourceId: token,
      request,
    });

    return { user: found, token };
  }

  async useBackupCode(
    pendingToken: string,
    code: string,
    request: Request,
  ): Promise<{ user: UserRow; token: string }> {
    const userId = await redis.get(`2fa_pending:${pendingToken}`);
    if (!userId) {
      throw new AuthError(
        "INVALID_TOKEN",
        "Two-factor session expired. Please sign in again.",
      );
    }

    const tfRows = await db
      .select()
      .from(twoFactor)
      .where(eq(twoFactor.userId, userId))
      .limit(1);

    const tf = tfRows[0];
    if (!tf) throw new AuthError("INVALID_TOKEN", "Two-factor not configured.");

    const hashes: string[] = JSON.parse(tf.backupCodes);
    const codeHash = await hashBackupCode(code.toUpperCase());
    const idx = hashes.indexOf(codeHash);

    if (idx < 0)
      await failTwoFactorAttempt(pendingToken, "Invalid backup code.");

    const remaining = hashes.filter((_, i) => i !== idx);
    await db
      .update(twoFactor)
      .set({ backupCodes: JSON.stringify(remaining) })
      .where(eq(twoFactor.userId, userId));

    await redis.del(`2fa_pending:${pendingToken}`);
    await redis.del(`2fa_attempts:${pendingToken}`);

    const users = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    const found = users[0];
    if (!found) throw new AuthError("NOT_FOUND", "User not found.");

    const token = await createSession(found.id, request);

    await audit({
      actorId: found.id,
      action: "user.sign-in",
      resourceType: "session",
      resourceId: token,
      request,
      metadata: { method: "backup-code" },
    });

    return { user: found, token };
  }

  async disableTotp(userId: string, code: string): Promise<void> {
    const tfRows = await db
      .select()
      .from(twoFactor)
      .where(eq(twoFactor.userId, userId))
      .limit(1);

    const tf = tfRows[0];
    if (!tf) throw new AuthError("NOT_FOUND", "Two-factor is not enabled.");

    const valid = await verifyTotp(tf.secret, code);
    if (!valid)
      throw new AuthError("TOTP_INVALID", "Invalid authenticator code.");

    await db.delete(twoFactor).where(eq(twoFactor.userId, userId));
  }
}

export const authService = new AuthService();
