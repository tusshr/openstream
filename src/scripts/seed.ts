/**
 * Dev seed — creates realistic LMS data for local development.
 *
 * Run:  bun run db:seed
 *
 * Known accounts (password: Password123!):
 *   admin@openstream.dev      — admin
 *   sarah@openstream.dev      — educator
 *   marcus@openstream.dev     — educator
 *   student1–8@openstream.dev — students
 */

import { drizzle } from "drizzle-orm/bun-sql";
import { reset, seed } from "drizzle-seed";

import * as schema from "@/db/schema";
import { generateId } from "@/lib/id";
import { hashPassword } from "@/lib/password";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

// Stand-alone connection — avoids importing @/db which pulls in full env validation.
const db = drizzle(DATABASE_URL, { schema });

const DEV_PASSWORD = "Password123!";
const NOW = new Date();

// ---------------------------------------------------------------------------
// Preset data
// ---------------------------------------------------------------------------

const CATEGORIES = [
  {
    name: "Web Development",
    slug: "web-development",
    description: "Frontend, backend, and full-stack web engineering.",
  },
  {
    name: "Mobile Development",
    slug: "mobile-development",
    description: "iOS, Android, and cross-platform app development.",
  },
  {
    name: "Data Science",
    slug: "data-science",
    description: "Data analysis, visualization, and statistical modelling.",
  },
  {
    name: "AI & Machine Learning",
    slug: "ai-machine-learning",
    description: "ML algorithms, deep learning, and applied AI.",
  },
  {
    name: "Design",
    slug: "design",
    description: "UX/UI design, design systems, and visual communication.",
  },
  {
    name: "DevOps",
    slug: "devops",
    description: "CI/CD, containerization, cloud, and infrastructure.",
  },
  {
    name: "Cybersecurity",
    slug: "cybersecurity",
    description: "Application security, penetration testing, and hardening.",
  },
  {
    name: "Business",
    slug: "business",
    description: "Product management, entrepreneurship, and leadership.",
  },
] as const;

const TAGS = [
  { name: "TypeScript", slug: "typescript" },
  { name: "JavaScript", slug: "javascript" },
  { name: "React", slug: "react" },
  { name: "Node.js", slug: "nodejs" },
  { name: "Python", slug: "python" },
  { name: "SQL", slug: "sql" },
  { name: "Docker", slug: "docker" },
  { name: "Kubernetes", slug: "kubernetes" },
  { name: "REST API", slug: "rest-api" },
  { name: "GraphQL", slug: "graphql" },
  { name: "UI Design", slug: "ui-design" },
  { name: "System Design", slug: "system-design" },
  { name: "Figma", slug: "figma" },
  { name: "PostgreSQL", slug: "postgresql" },
  { name: "Linux", slug: "linux" },
] as const;

const COURSE_TITLES = [
  "Complete TypeScript Bootcamp",
  "React 18 from Zero to Hero",
  "Node.js Backend Mastery",
  "Python for Data Science",
  "Figma for Developers",
  "Docker & Kubernetes in Practice",
  "SQL & PostgreSQL Deep Dive",
  "REST API Design Principles",
  "GraphQL with Apollo Server",
  "System Design Fundamentals",
  "Building Design Systems",
  "JavaScript Performance Optimization",
  "Linux Command Line Essentials",
  "Cybersecurity for Developers",
  "Product Management 101",
] as const;

// ---------------------------------------------------------------------------

async function main() {
  console.log("Resetting database...");
  await reset(db, schema);

  // -------------------------------------------------------------------------
  // 1. Users  (manual — passwords must be argon2id-hashed)
  // -------------------------------------------------------------------------

  const adminId = generateId();
  const educator1Id = generateId();
  const educator2Id = generateId();
  const studentIds = Array.from({ length: 8 }, () => generateId());
  const allUserIds = [adminId, educator1Id, educator2Id, ...studentIds];

  const hash = await hashPassword(DEV_PASSWORD);

  await db.insert(schema.user).values([
    {
      id: adminId,
      name: "Admin User",
      email: "admin@openstream.dev",
      role: "admin",
      emailVerified: true,
      password: hash,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: educator1Id,
      name: "Sarah Chen",
      email: "sarah@openstream.dev",
      role: "student",
      emailVerified: true,
      password: hash,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: educator2Id,
      name: "Marcus Webb",
      email: "marcus@openstream.dev",
      role: "student",
      emailVerified: true,
      password: hash,
      createdAt: NOW,
      updatedAt: NOW,
    },
    ...studentIds.map((id, i) => ({
      id,
      name: `Student ${i + 1}`,
      email: `student${i + 1}@openstream.dev`,
      role: "student" as const,
      emailVerified: true,
      password: hash,
      createdAt: NOW,
      updatedAt: NOW,
    })),
  ]);

  // -------------------------------------------------------------------------
  // 2. Educator profiles  (manual — refs educator user IDs)
  // -------------------------------------------------------------------------

  const ep1Id = generateId();
  const ep2Id = generateId();

  await db.insert(schema.educatorProfiles).values([
    {
      id: ep1Id,
      userId: educator1Id,
      bio: "Full-stack developer and educator with 10 years of experience in web technologies.",
      headline: "Senior Software Engineer & Educator",
      website: "https://sarahchen.dev",
      twitter: "@sarahchen_dev",
      linkedin: "sarahchen",
    },
    {
      id: ep2Id,
      userId: educator2Id,
      bio: "UX/UI designer who teaches design systems and product thinking.",
      headline: "Product Designer & Design Educator",
      website: "https://marcuswebb.io",
      twitter: "@marcuswebb",
      linkedin: "marcuswebb",
    },
  ]);

  // -------------------------------------------------------------------------
  // 3. Categories + tags  (drizzle-seed — no FK dependencies)
  // -------------------------------------------------------------------------

  await seed(
    db,
    { categories: schema.categories },
    { count: CATEGORIES.length, seed: 1 },
  ).refine((f) => ({
    categories: {
      columns: {
        name: f.valuesFromArray({
          values: [...CATEGORIES.map((c) => c.name)],
          isUnique: true,
        }),
        slug: f.valuesFromArray({
          values: [...CATEGORIES.map((c) => c.slug)],
          isUnique: true,
        }),
        description: f.valuesFromArray({
          values: [...CATEGORIES.map((c) => c.description)],
        }),
      },
    },
  }));

  await seed(db, { tags: schema.tags }, { count: TAGS.length, seed: 1 }).refine(
    (f) => ({
      tags: {
        columns: {
          name: f.valuesFromArray({
            values: [...TAGS.map((t) => t.name)],
            isUnique: true,
          }),
          slug: f.valuesFromArray({
            values: [...TAGS.map((t) => t.slug)],
            isUnique: true,
          }),
        },
      },
    }),
  );

  // Fetch IDs for FK references in subsequent phases
  const categoryRows = await db
    .select({ id: schema.categories.id })
    .from(schema.categories);
  const tagRows = await db.select({ id: schema.tags.id }).from(schema.tags);

  // -------------------------------------------------------------------------
  // 4. Courses + chapters  (manual — drizzle-seed can't handle the tsvector
  //    generated column on courses.search, so we insert directly)
  // -------------------------------------------------------------------------

  const courseSlugs = COURSE_TITLES.map((t) =>
    t.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  );
  const levels = ["beginner", "intermediate", "advanced"] as const;
  const prices = ["0.00", "19.99", "29.99", "49.99", "79.99"];
  const ratings = ["3.50", "4.00", "4.25", "4.50", "4.75", "5.00"];
  const educatorIds = [educator1Id, educator2Id];
  const catIds = categoryRows.map((c) => c.id);

  const courseInserts = COURSE_TITLES.map((title, i) => ({
    id: generateId(),
    title,
    slug: courseSlugs[i]!,
    educatorId: educatorIds[i % 2]!,
    categoryId: catIds[i % catIds.length]!,
    description:
      "A comprehensive course covering all the essentials and advanced topics. " +
      "Designed for practitioners who want real-world skills.",
    level: levels[i % 3]!,
    status: "published" as const,
    language: "en",
    price: prices[i % prices.length]!,
    enrolledCount: (i + 1) * 47,
    reviewCount: (i + 1) * 12,
    averageRating: ratings[i % ratings.length]!,
    publishedAt: new Date(2024, i % 12, (i % 28) + 1),
    createdAt: NOW,
    updatedAt: NOW,
  }));

  await db.insert(schema.courses).values(courseInserts);

  const insertedCourseIds = courseInserts.map((c) => c.id);

  const chapterTitles = [
    "Getting Started",
    "Core Concepts",
    "Intermediate Techniques",
    "Advanced Topics",
  ];

  const chapterInserts = insertedCourseIds.flatMap((courseId, ci) =>
    chapterTitles.map((title, pi) => ({
      id: generateId(),
      courseId,
      title: `${title} — Part ${ci + 1}`,
      position: pi + 1,
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );

  await db.insert(schema.chapters).values(chapterInserts);

  // -------------------------------------------------------------------------
  // 5. Lessons  (manual — courseId must match the chapter's parent course)
  // -------------------------------------------------------------------------

  const lessonTypes = ["video", "text", "quiz"] as const;

  await db.insert(schema.lessons).values(
    chapterInserts.flatMap((chapter, ci) =>
      Array.from({ length: 5 }, (_, i) => ({
        id: generateId(),
        chapterId: chapter.id,
        courseId: chapter.courseId,
        title: `Lesson ${i + 1}`,
        type: lessonTypes[(ci + i) % lessonTypes.length]!,
        position: i + 1,
        isPreview: i === 0,
        durationSeconds: 300 + i * 120,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    ),
  );

  // -------------------------------------------------------------------------
  // 6. Course tags  (manual — many-to-many, drizzle-seed `with` doesn't support it)
  // -------------------------------------------------------------------------

  const tagIds = tagRows.map((t) => t.id);

  await db.insert(schema.courseTags).values(
    insertedCourseIds.flatMap((courseId, ci) =>
      // 3 distinct tags per course via rotating offset
      [0, 1, 2].map((offset) => ({
        courseId,
        tagId: tagIds[(ci + offset) % tagIds.length]!,
      })),
    ),
  );

  // -------------------------------------------------------------------------
  // 7. Enrollments  (manual — each student enrolls in 3 courses)
  // -------------------------------------------------------------------------

  const enrollmentRows = studentIds.flatMap((userId, si) =>
    [0, 1, 2].map((offset) => ({
      id: generateId(),
      userId,
      courseId:
        insertedCourseIds[(si * 3 + offset) % insertedCourseIds.length]!,
      status: "active" as const,
      enrolledAt: NOW,
    })),
  );

  await db.insert(schema.enrollments).values(enrollmentRows);

  // -------------------------------------------------------------------------
  // 8. Reviews  (manual — first 12 enrollments leave a review)
  // -------------------------------------------------------------------------

  const starRatings = [4, 5, 4, 5, 5, 4, 4, 5, 4, 5, 5, 4];

  await db.insert(schema.courseReviews).values(
    enrollmentRows.slice(0, 12).map(({ userId, courseId }, i) => ({
      id: generateId(),
      userId,
      courseId,
      rating: starRatings[i % starRatings.length]!,
      body: "Great course — well-paced and very practical.",
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );

  // -------------------------------------------------------------------------

  const lessonCount = chapterInserts.length * 5;

  console.log("\nSeed complete.");
  console.log(
    `  ${courseInserts.length} courses  •  ${chapterInserts.length} chapters  •  ${lessonCount} lessons`,
  );
  console.log(`  ${categoryRows.length} categories  •  ${tagRows.length} tags`);
  console.log(
    `  ${allUserIds.length} users  •  ${enrollmentRows.length} enrollments\n`,
  );
  console.log(`Dev accounts — password: ${DEV_PASSWORD}`);
  console.log("  admin@openstream.dev      admin");
  console.log("  sarah@openstream.dev      educator");
  console.log("  marcus@openstream.dev     educator");
  console.log("  student1–8@openstream.dev students");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
