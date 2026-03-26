ALTER TABLE "account" DROP COLUMN "access_token";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "refresh_token";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "id_token";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "access_token_expires_at";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "refresh_token_expires_at";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "scope";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "first_name";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "last_name";