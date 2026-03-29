import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from "@casl/ability";

import {
  courseReviews,
  courses,
  enrollments,
  lessonProgress,
  orders,
  user,
} from "@/db/schema";

type CourseSubject = Pick<typeof courses.$inferSelect, "educatorId"> | "Course";
type EnrollmentSubject =
  | Pick<typeof enrollments.$inferSelect, "userId">
  | "Enrollment";
type OrderSubject = Pick<typeof orders.$inferSelect, "userId"> | "Order";
type ReviewSubject =
  | Pick<typeof courseReviews.$inferSelect, "userId">
  | "Review";
type ProgressSubject =
  | Pick<typeof lessonProgress.$inferSelect, "userId">
  | "Progress";
type UserSubject = Pick<typeof user.$inferSelect, "role"> | "User";

type Abilities =
  | ["manage", "all"]
  | ["create" | "read" | "update" | "delete", CourseSubject]
  | ["create" | "read" | "delete", EnrollmentSubject]
  | ["create" | "read", OrderSubject]
  | ["create" | "update" | "delete", ReviewSubject]
  | ["create" | "read", ProgressSubject]
  | ["read" | "update", UserSubject];

export type AppAbility = MongoAbility<Abilities>;

export type Permission =
  | ["create" | "read" | "update" | "delete", "Course"]
  | ["create" | "read" | "delete", "Enrollment"]
  | ["create" | "read", "Order"]
  | ["create" | "update" | "delete", "Review"]
  | ["create" | "read", "Progress"]
  | ["read" | "update", "User"]
  | ["manage", "all"];

export function buildAbility(user: { id: string; role: string }): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  can("read", "Course");

  switch (user.role) {
    case "admin":
      can("manage", "all");
      break;

    case "educator":
      can("create", "Course");
      can("update", "Course", ["status"], { educatorId: user.id });
      can("delete", "Course", { educatorId: user.id });
      break;

    case "student":
      can("create", "Enrollment");
      can("read", "Enrollment", { userId: user.id });
      can("delete", "Enrollment", { userId: user.id }); // unenroll own
      can("create", "Order");
      can("read", "Order", { userId: user.id });
      can("create", "Review");
      can("update", "Review", { userId: user.id });
      can("delete", "Review", { userId: user.id });
      can("create", "Progress");
      can("read", "Progress", { userId: user.id });
      break;

    default:
      break;
  }

  return build();
}
