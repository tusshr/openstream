import { t } from "elysia";

const LessonTypeSchema = t.Union([
  t.Literal("video"),
  t.Literal("text"),
  t.Literal("quiz"),
  t.Literal("assignment"),
]);

export const PlayerAttachmentSchema = t.Object({
  id: t.String(),
  name: t.String(),
  mimeType: t.Union([t.String(), t.Null()]),
  fileSize: t.Union([t.Integer(), t.Null()]),
  downloadUrl: t.String(),
});

export const LessonPlayerSchema = t.Object({
  id: t.String(),
  courseId: t.String(),
  title: t.String(),
  type: LessonTypeSchema,
  content: t.Union([t.String(), t.Null()]),
  durationSeconds: t.Union([t.Integer(), t.Null()]),
  isPreview: t.Boolean(),
  videoUrl: t.Union([t.String(), t.Null()]),
  attachments: t.Array(PlayerAttachmentSchema),
  urlExpiresInSeconds: t.Integer(),
});
