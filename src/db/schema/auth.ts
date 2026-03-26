import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateId } from "@/lib/id";

export const user = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(generateId),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("two_factor_user_id_idx").on(t.userId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorId, t.createdAt),
    index("audit_log_resource_idx").on(
      t.resourceType,
      t.resourceId,
      t.createdAt,
    ),
    index("audit_log_action_idx").on(t.action, t.createdAt),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);
