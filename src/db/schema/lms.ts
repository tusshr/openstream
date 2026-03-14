import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { generateId } from "@/lib/id";

import { user } from "./auth";

export const courseStatusEnum = pgEnum("course_status", [
  "draft",
  "published",
  "archived",
]);

export const courseLevelEnum = pgEnum("course_level", [
  "beginner",
  "intermediate",
  "advanced",
]);

export const lessonTypeEnum = pgEnum("lesson_type", [
  "video",
  "text",
  "quiz",
  "assignment",
]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "active",
  "completed",
  "refunded",
  "suspended",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "completed",
  "refunded",
  "failed",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const educatorProfiles = pgTable("educator_profiles", {
  id: text("id").primaryKey().$defaultFn(generateId),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  bio: text("bio"),
  headline: text("headline"),
  website: text("website"),
  twitter: text("twitter"),
  linkedin: text("linkedin"),
  youtube: text("youtube"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey().$defaultFn(generateId),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: text("id").primaryKey().$defaultFn(generateId),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});
