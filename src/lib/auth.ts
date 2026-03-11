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
import { generateId } from "@/lib/id";
import { enqueueEmail } from "@/modules/jobs";

import { redis } from "./redis";

export const auth = betterAuth({
  appName: "Openstream",

  database: drizzleAdapter(db, { provider: "pg", schema }),

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
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await enqueueEmail({
        kind: "reset-password",
        to: user.email,
        name: user.name,
        url,
      });
    },
    onPasswordReset: async ({ user }, request) => {
      await audit(buildPasswordResetAuditParams(user, request));
    },
  },

  emailVerification: {
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
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    storeSessionInDatabase: true,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
    storage: "secondary-storage",
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    database: { generateId: generateId },
  },

  // Audit hooks fire on DB writes — more reliable than endpoint hooks which
  // also fire on failed attempts. Wired: sign-up, sign-in, sign-out,
  // password-reset. 2FA toggle and role changes need follow-up endpoint hooks.
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
      delete: {
        after: async (oldSession, context) => {
          const params = buildSignOutAuditParams(oldSession, context);
          if (params) await audit(params);
        },
      },
    },
  },

  experimental: { joins: true },

  plugins: [
    twoFactor({
      issuer: "Openstream",
      totpOptions: { digits: 6, period: 30 },
      backupCodeOptions: {
        amount: 10,
        length: 10,
        storeBackupCodes: "encrypted",
      },
      twoFactorCookieMaxAge: 600,
      trustDeviceMaxAge: 30 * 24 * 60 * 60,
    }),
    admin(),
  ],
});

export type Auth = typeof auth;
