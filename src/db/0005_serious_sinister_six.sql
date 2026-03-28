ALTER TABLE "courses" DROP CONSTRAINT "courses_educator_id_educator_profiles_id_fk";
--> statement-breakpoint
-- Remap ownership from educator_profiles.id to the profile's user_id, so the
-- new FK to "user" is satisfied by existing rows.
UPDATE "courses" SET "educator_id" = "ep"."user_id"
FROM "educator_profiles" "ep"
WHERE "ep"."id" = "courses"."educator_id";
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_educator_id_user_id_fk" FOREIGN KEY ("educator_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
