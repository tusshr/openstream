import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { twoFactor } from "better-auth/plugins/two-factor";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";
import {
  audit,
  buildPasswordResetAuditParams,
  buildSignOutAuditParams,
} from "@/lib/audit";
import { enqueueEmail } from "@/modules/jobs";

import { redis } from "./redis";

export const auth = betterAuth({
  appName: "Openstream",

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  // Redis as secondary storage: sessions + rate limits never hit the primary DB
  secondaryStorage: {
    get: (key) => redis.get(key),
    set: async (key, value, ttl) => {
      if (ttl) {
        await redis.send("SET", [key, value, "EX", String(ttl)]);
      } else {
        await redis.set(key, value);
      }
    },
    delete: async (key) => {
      await redis.del(key);
    },
  },

  user: {
    additionalFields: {
      firstName: {
        type: "string",
        required: false,
        defaultValue: null,
        input: true,
      },
      lastName: {
        type: "string",
        required: false,
        defaultValue: null,
        input: true,
      },
    },
    changeEmail: {
      enabled: true,
      // Sent to the *current* email address. The body names both addresses
      // so the user knows what they're approving.
      sendChangeEmailVerification: async ({ user, newEmail, url }) => {
        await enqueueEmail({
          kind: "change-email",
          to: user.email,
          name: user.name,
          newEmail,
          url,
        });
      },
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    // Block sign-in until the user verifies the address they registered
    // with. The verification email is enqueued by sendVerificationEmail
    // below (auto-fired by better-auth on signup).
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await enqueueEmail({
        kind: "reset-password",
        to: user.email,
        name: user.name,
        url,
      });
    },
    // Fires after the password has actually been changed via the reset
    // token. Better suited than a `databaseHooks.account.update` filter
    // because account.update also covers token refreshes and email links.
    onPasswordReset: async ({ user }, request) => {
      await audit(buildPasswordResetAuditParams(user, request));
    },
  },

  emailVerification: {
    // Better-auth invokes this whenever a verification email is needed:
    // signup (when sendOnSignUp is true), explicit /api/auth/send-verification
    // calls, and resends triggered by sign-in attempts on unverified accounts.
    sendVerificationEmail: async ({ user, url }) => {
      await enqueueEmail({
        kind: "verification",
        to: user.email,
        name: user.name,
        url,
      });
    },
    sendOnSignUp: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh session if older than 1 day
    storeSessionInDatabase: true, // persist to DB alongside Redis
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // re-validate against Redis every 5 minutes
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
    storage: "secondary-storage", // use Redis for rate limit counters
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },

  // Audit hooks. These fire when better-auth writes to the underlying tables,
  // which is the most reliable signal that the operation actually happened
  // (vs hooking endpoint paths, which would fire for failed attempts too).
  //
  // Wired:
  //   - sign-up        (user.create.after)
  //   - sign-in        (session.create.after)
  //   - sign-out       (session.delete.after, filtered by /sign-out path)
  //   - password reset (emailAndPassword.onPasswordReset above)
  //
  // 2FA toggle and role changes go through plugin endpoints with no clean
  // databaseHook surface; they'll need endpoint hooks in a follow-up.
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          await audit({
            actorId: newUser.id,
            action: "user.sign-up",
            resourceType: "user",
            resourceId: newUser.id,
          });
        },
      },
    },
    session: {
      create: {
        after: async (newSession) => {
          await audit({
            actorId: newSession.userId,
            action: "user.sign-in",
            resourceType: "session",
            resourceId: newSession.id,
            ip: newSession.ipAddress ?? null,
            userAgent: newSession.userAgent ?? null,
          });
        },
      },
      // session.delete fires from many places: explicit sign-out, admin
      // revoke, and the cascade triggered by revokeSessionsOnPasswordReset.
      // We only want to audit the user-initiated case, so we filter by the
      // endpoint path. Other deletes get their own audit entries from their
      // own hooks (password-reset above, admin actions later).
      delete: {
        after: async (oldSession, context) => {
          const params = buildSignOutAuditParams(oldSession, context);
          if (params) await audit(params);
        },
      },
    },
  },

  experimental: {
    // 2-3x performance improvement for DB queries via joins
    joins: true,
  },

  plugins: [
    twoFactor({
      issuer: "Openstream",
      totpOptions: {
        digits: 6,
        period: 30,
      },
      backupCodeOptions: {
        amount: 10,
        length: 10,
        storeBackupCodes: "encrypted",
      },
      twoFactorCookieMaxAge: 600, // 10 min window to complete 2FA
      trustDeviceMaxAge: 30 * 24 * 60 * 60, // trust device for 30 days
    }),
    // Role management — exposes user.role on every session
    // Default role: "user". Promote via auth.api.setRole() or admin routes.
    // Prepares the foundation for CASL ability definitions.
    admin(),
  ],
});

export type Auth = typeof auth;
