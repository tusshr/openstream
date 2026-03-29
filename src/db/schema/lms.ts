import { sql, type SQL } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { generateId } from "@/lib/id";

import { user } from "./auth";

// ---------------------------------------------------------------------------
// Custom types
// ---------------------------------------------------------------------------

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

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
  "dropped", // voluntary unenroll (distinct from refund/suspension)
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey().$defaultFn(generateId),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tags = pgTable("tags", {
  id: text("id").primaryKey().$defaultFn(generateId),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
});
export const courses = pgTable(
  "courses",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    educatorId: text("educator_id")
      .notNull()
      .references(() => user.id),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    thumbnailKey: text("thumbnail_key"),
    previewVideoKey: text("preview_video_key"),
    level: courseLevelEnum("level").notNull().default("beginner"),
    status: courseStatusEnum("status").notNull().default("draft"),
    language: text("language").notNull().default("en"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    enrolledCount: integer("enrolled_count").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    averageRating: numeric("average_rating", { precision: 4, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    search: tsvector("search").generatedAlwaysAs(
      (): SQL =>
        sql`setweight(to_tsvector('english', ${courses.title}), 'A') || setweight(to_tsvector('english', coalesce(${courses.description}, '')), 'B')`,
    ),
  },
  (t) => [
    index("courses_educator_id_idx").on(t.educatorId),
    index("courses_category_id_idx").on(t.categoryId),
    index("courses_status_idx").on(t.status),
    index("courses_published_at_idx").on(t.publishedAt),
    index("courses_search_idx").using("gin", t.search),
  ],
);

export const courseTags = pgTable(
  "course_tags",
  {
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.courseId, t.tagId] }),
    index("course_tags_tag_id_idx").on(t.tagId),
  ],
);

export const chapters = pgTable(
  "chapters",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: smallint("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("chapters_course_id_idx").on(t.courseId),
    index("chapters_course_position_idx").on(t.courseId, t.position),
  ],
);

export const lessons = pgTable(
  "lessons",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: lessonTypeEnum("type").notNull().default("video"),
    position: smallint("position").notNull().default(0),
    isPreview: boolean("is_preview").notNull().default(false),
    videoKey: text("video_key"),
    durationSeconds: integer("duration_seconds"),
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("lessons_chapter_id_idx").on(t.chapterId),
    index("lessons_course_id_idx").on(t.courseId),
    index("lessons_course_position_idx").on(t.courseId, t.position),
  ],
);

export const lessonAttachments = pgTable(
  "lesson_attachments",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fileKey: text("file_key").notNull(),
    fileSize: bigint("file_size", { mode: "bigint" }),
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lesson_attachments_lesson_id_idx").on(t.lessonId)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("enrollments_user_course_idx").on(t.userId, t.courseId),
    index("enrollments_course_id_idx").on(t.courseId),
    index("enrollments_user_id_idx").on(t.userId),
  ],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    watchedSeconds: integer("watched_seconds").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("lesson_progress_user_lesson_idx").on(t.userId, t.lessonId),
    index("lesson_progress_user_course_idx").on(t.userId, t.courseId),
    index("lesson_progress_lesson_id_idx").on(t.lessonId),
    index("lesson_progress_course_id_idx").on(t.courseId),
  ],
);

export const courseReviews = pgTable(
  "course_reviews",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    body: text("body"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("course_reviews_user_course_idx").on(t.userId, t.courseId),
    index("course_reviews_course_id_idx").on(t.courseId),
  ],
);

export const certificates = pgTable(
  "certificates",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id, { onDelete: "cascade" }),
    verificationCode: text("verification_code").notNull().unique(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("certificates_user_course_idx").on(t.userId, t.courseId),
    index("certificates_course_id_idx").on(t.courseId),
    index("certificates_enrollment_id_idx").on(t.enrollmentId),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: orderStatusEnum("status").notNull().default("pending"),
    totalAmount: numeric("total_amount", {
      precision: 10,
      scale: 2,
    }).notNull(),
    paymentProvider: text("payment_provider"),
    paymentReference: text("payment_reference"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("orders_user_id_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    index("orders_payment_reference_idx").on(t.paymentReference),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: text("id").primaryKey().$defaultFn(generateId),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    enrollmentId: text("enrollment_id").references(() => enrollments.id, {
      onDelete: "set null",
    }),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    index("order_items_course_id_idx").on(t.courseId),
    index("order_items_enrollment_id_idx").on(t.enrollmentId),
  ],
);
