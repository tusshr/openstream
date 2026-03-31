import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  chapters,
  courses,
  enrollments,
  lessonAttachments,
  lessons,
  user,
} from "@/db/schema";
import { generateId } from "@/lib/id";
import { redis } from "@/lib/redis";

import { callApp } from "./helpers/request";

let dbUp = false;
try {
  await db.execute(sql`select 1`);
  dbUp = true;
} catch {
  dbUp = false;
}

const educatorId = generateId();
const studentId = generateId();
const outsiderId = generateId();
const courseId = generateId();
const chapterId = generateId();
const previewLesson = generateId();
const gatedLesson = generateId();
const attachmentId = generateId();

async function forge(id: string): Promise<string> {
  const token = `itest-${id}`;
  await redis.send("SET", [
    `session:${token}`,
    JSON.stringify({
      session: { id: `s-${token}`, token, userId: id },
      user: { id, name: "Stu", email: `${id}@itest.local`, role: "student" },
    }),
    "EX",
    "300",
  ]);
  return token;
}
const cookie = (token: string) => ({ cookie: `session_token=${token}` });

describe.skipIf(!dbUp)("course player (real DB)", () => {
  beforeAll(async () => {
    const now = new Date();
    await db.insert(user).values(
      [educatorId, studentId, outsiderId].map((id) => ({
        id,
        name: "U",
        email: `${id}@itest.local`,
        role: id === educatorId ? ("educator" as const) : ("student" as const),
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db
      .insert(courses)
      .values({
        id: courseId,
        educatorId,
        title: "Play",
        slug: `itest-play-${courseId}`,
        status: "published",
        price: "0",
        publishedAt: now,
      });
    await db
      .insert(chapters)
      .values({ id: chapterId, courseId, title: "Ch", position: 0 });
    await db.insert(lessons).values([
      {
        id: previewLesson,
        chapterId,
        courseId,
        title: "Free preview",
        position: 0,
        isPreview: true,
        videoKey: "courses/x/preview.mp4",
      },
      {
        id: gatedLesson,
        chapterId,
        courseId,
        title: "Members only",
        position: 1,
        isPreview: false,
        videoKey: "courses/x/lesson2.mp4",
      },
    ]);
    await db
      .insert(lessonAttachments)
      .values({
        id: attachmentId,
        lessonId: gatedLesson,
        name: "slides.pdf",
        fileKey: "courses/x/slides.pdf",
        mimeType: "application/pdf",
      });
    await db
      .insert(enrollments)
      .values({ userId: studentId, courseId, status: "active" });
  });

  afterAll(async () => {
    await db.delete(courses).where(eq(courses.id, courseId)); // cascades the rest
    for (const id of [educatorId, studentId, outsiderId]) {
      await db.delete(user).where(eq(user.id, id));
    }
  });

  test("preview lesson is playable anonymously, with a signed video URL", async () => {
    const res = await callApp<{
      data: { videoUrl: string | null; isPreview: boolean };
    }>(`/api/lessons/${previewLesson}`, { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.body.data.isPreview).toBe(true);
    expect(res.body.data.videoUrl).toBeTruthy();
  });

  test("gated lesson is locked for anonymous and non-enrolled viewers", async () => {
    const anon = await callApp(`/api/lessons/${gatedLesson}`, {
      method: "GET",
    });
    expect(anon.status).toBe(403);

    const outsider = await callApp(`/api/lessons/${gatedLesson}`, {
      method: "GET",
      headers: cookie(await forge(outsiderId)),
    });
    expect(outsider.status).toBe(403);
  });

  test("enrolled student gets the gated lesson with signed video + attachment URLs", async () => {
    const res = await callApp<{
      data: {
        videoUrl: string | null;
        attachments: Array<{ name: string; downloadUrl: string }>;
      };
    }>(`/api/lessons/${gatedLesson}`, {
      method: "GET",
      headers: cookie(await forge(studentId)),
    });
    expect(res.status).toBe(200);
    expect(res.body.data.videoUrl).toBeTruthy();
    expect(res.body.data.attachments).toHaveLength(1);
    expect(res.body.data.attachments[0]!.downloadUrl).toBeTruthy();
  });

  test("unknown lesson → 404", async () => {
    const res = await callApp("/api/lessons/does-not-exist", { method: "GET" });
    expect(res.status).toBe(404);
  });
});
