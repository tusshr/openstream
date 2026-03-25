DROP INDEX "certificates_verification_code_idx";--> statement-breakpoint
DROP INDEX "courses_slug_idx";--> statement-breakpoint
DROP INDEX "session_token_idx";--> statement-breakpoint
CREATE INDEX "certificates_course_id_idx" ON "certificates" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "certificates_enrollment_id_idx" ON "certificates" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "lesson_progress_lesson_id_idx" ON "lesson_progress" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "lesson_progress_course_id_idx" ON "lesson_progress" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "order_items_enrollment_id_idx" ON "order_items" USING btree ("enrollment_id");