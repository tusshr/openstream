import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from "@casl/ability";

import { courses, enrollments, orders, user } from "@/db/schema";

type CourseSubject = Pick<typeof courses.$inferSelect, "educatorId"> | "Course";
type EnrollmentSubject =
  | Pick<typeof enrollments.$inferSelect, "userId">
  | "Enrollment";
type OrderSubject = Pick<typeof orders.$inferSelect, "userId"> | "Order";
type UserSubject = Pick<typeof user.$inferSelect, "role"> | "User";

type Abilities =
  | ["manage", "all"]
  | ["create" | "read" | "update" | "delete", CourseSubject]
  | ["create" | "read", EnrollmentSubject]
  | ["create" | "read", OrderSubject]
  | ["read" | "update", UserSubject];

export type AppAbility = MongoAbility<Abilities>;

export type Permission =
  | ["create" | "read" | "update" | "delete", "Course"]
  | ["create" | "read", "Enrollment"]
  | ["create" | "read", "Order"]
  | ["read" | "update", "User"]
  | ["manage", "all"];

export function buildAbility(user: {
  id: string;
  role: string;
  educatorProfileId?: string | null;
}): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  can("read", "Course");

  switch (user.role) {
    case "admin":
      can("manage", "all");
      break;

    case "educator":
      can("create", "Course");
      if (user.educatorProfileId) {
        can("update", "Course", ["status"], {
          educatorId: user.educatorProfileId,
        });
        can("delete", "Course", {
          educatorId: user.educatorProfileId,
        });
      }
      break;

    case "student":
      can("create", "Enrollment");
      can("read", "Enrollment", { userId: user.id });
      can("create", "Order");
      can("read", "Order", { userId: user.id });
      break;

    default:
      break;
  }

  return build();
}
