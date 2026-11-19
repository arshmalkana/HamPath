ALTER TABLE "attempt" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "lab_event" ADD COLUMN "client_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_user_client_idx" ON "attempt" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lab_event_user_client_idx" ON "lab_event" USING btree ("user_id","client_id");