CREATE TABLE "checkpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"question_ids" text[] NOT NULL,
	"correct" integer,
	"total" integer,
	"score" real,
	"passed" boolean,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "section_badge" (
	"user_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"checkpoint_id" uuid,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "section_badge_user_id_section_id_pk" PRIMARY KEY("user_id","section_id")
);
--> statement-breakpoint
ALTER TABLE "card" DROP CONSTRAINT "card_type";--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "mock_exam" ADD COLUMN "correct" integer;--> statement-breakpoint
ALTER TABLE "mock_exam" ADD COLUMN "total" integer;--> statement-breakpoint
ALTER TABLE "mock_exam" ADD COLUMN "passed" boolean;--> statement-breakpoint
ALTER TABLE "mock_exam" ADD COLUMN "honours" boolean;--> statement-breakpoint
ALTER TABLE "mock_exam" ADD COLUMN "section_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "mock_exam" ADD COLUMN "time_limit_s" integer DEFAULT 10800 NOT NULL;--> statement-breakpoint
ALTER TABLE "mock_exam" ADD COLUMN "blueprint_version" text;--> statement-breakpoint
ALTER TABLE "question_state" ADD COLUMN "last_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "question_state" ADD COLUMN "reps" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_badge" ADD CONSTRAINT "section_badge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_badge" ADD CONSTRAINT "section_badge_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_badge" ADD CONSTRAINT "section_badge_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkpoint_user_idx" ON "checkpoint" USING btree ("user_id","section_id");--> statement-breakpoint
CREATE INDEX "attempt_session_idx" ON "attempt" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "attempt_user_day_idx" ON "attempt" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_type" CHECK (type IN ('intro','hook','lab','concept','predict','numeric','worked_example','drag_drop','flashcards','audio'));