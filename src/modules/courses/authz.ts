import { subject } from "@casl/ability";

import { type AppAbility } from "@/lib/ability";
import { HttpProblem } from "@/lib/response";

import { courseService } from "./service";

// "Compose from parent" authz: a resource owned by a course (chapter, lesson,
// enrollment roster, …) has no permission of its own. Load the course (the
// aggregate root) and authorize the action as update:Course. Returns the course
// so callers can reuse it. 404 if missing, 403 if not the caller's.
export async function requireOwnedCourse(
  courseId: string,
  ability: AppAbility,
) {
  const course = await courseService.getById(courseId);
  if (!course) throw new HttpProblem(404, "NOT_FOUND", "Course not found.");
  if (ability.cannot("update", subject("Course", course))) {
    throw new HttpProblem(
      403,
      "FORBIDDEN",
      "You can only manage your own courses.",
    );
  }
  return course;
}
