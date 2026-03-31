import { Elysia, t } from "elysia";

import { errorModels } from "@/lib/api/error-models";
import { dataOf, HttpProblem, ok } from "@/lib/response";
import { getSession } from "@/lib/session";

import { LessonPlayerSchema } from "./model";
import { playerService } from "./service";

const SESSION_COOKIE = "session_token";

export const playerModule = new Elysia({ name: "player" }).use(errorModels).get(
  "/lessons/:id",
  async ({ params, cookie }) => {
    const token = cookie[SESSION_COOKIE]?.value as string | undefined;
    const session = token ? await getSession(token) : null;
    const result = await playerService.getLesson(
      params.id,
      session?.user.id ?? null,
    );
    switch (result.kind) {
      case "not-found":
        throw new HttpProblem(404, "NOT_FOUND", "Lesson not found.");
      case "locked":
        throw new HttpProblem(
          403,
          "LESSON_LOCKED",
          "Enroll in the course to access this lesson.",
        );
      case "ok":
        return ok(result.lesson);
    }
  },
  {
    params: t.Object({ id: t.String({ minLength: 1 }) }),
    response: {
      200: dataOf(LessonPlayerSchema),
      403: "ProblemDetails",
      404: "ProblemDetails",
    },
    detail: {
      summary: "Play a lesson",
      description:
        "Lesson content with short-lived signed video/attachment URLs. Open for preview lessons; otherwise requires enrollment.",
      tags: ["Lessons"],
    },
  },
);
