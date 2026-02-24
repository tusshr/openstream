import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins/two-factor";

import { env } from "@/env";

import { db } from "../database";
import * as schema from "../database/schema";
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
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
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

  experimental: {
    // 2-3x performance improvement for DB queries via joins
    // instead of multiple round-trips
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
  ],
});

export type Auth = typeof auth;
