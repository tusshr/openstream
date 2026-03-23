import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from "@casl/ability";

type Actions = "manage" | "create" | "read" | "update" | "delete";
type Subjects = "Course" | "User" | "Enrollment" | "Order" | "all";

export type AppAbility = MongoAbility<[Actions, Subjects]>;

export function buildAbility(user: { id: string; role: string }): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  switch (user.role) {
    case "admin":
      can("manage", "all");
      break;
    case "educator":
      can("read", "Course");
      can("create", "Course");
      can("update", "Course");
      can("delete", "Course");
      can("read", "Enrollment");
      can("read", "Order");
      break;
    default: // student
      can("read", "Course");
      can("create", "Enrollment");
      can("read", "Enrollment");
      can("create", "Order");
      can("read", "Order");
      break;
  }

  return build();
}
