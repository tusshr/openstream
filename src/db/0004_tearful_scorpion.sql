CREATE TYPE "public"."user_role" AS ENUM('student', 'educator', 'admin');--> statement-breakpoint
-- Drop the text default first; a text column can't take a user_role default,
-- and the type can't change while the old default is attached.
ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
-- Map the legacy 'user' value to 'student' as we cast; the new enum has no
-- 'user' member, so an unmapped cast would fail on existing rows.
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING (CASE WHEN "role" = 'user' THEN 'student' ELSE "role" END)::"public"."user_role";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'student';
