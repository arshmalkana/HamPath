CREATE TABLE "card_review" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"bank_version" integer NOT NULL,
	"questions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
ALTER TABLE "card_review" ADD CONSTRAINT "card_review_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_review" ADD CONSTRAINT "card_review_bank_version_bank_version_id_fk" FOREIGN KEY ("bank_version") REFERENCES "public"."bank_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_review" ADD CONSTRAINT "card_review_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_review_open_idx" ON "card_review" USING btree ("lesson_id") WHERE "card_review"."resolved_at" IS NULL;