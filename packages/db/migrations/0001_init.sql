CREATE TYPE "public"."attempt_context" AS ENUM('check', 'checkpoint', 'review', 'mock', 'placement');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('learner', 'instructor', 'admin');--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"option_id" uuid NOT NULL,
	"correct" boolean NOT NULL,
	"context" "attempt_context" NOT NULL,
	"try_no" smallint DEFAULT 1 NOT NULL,
	"ms_taken" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"redirect_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bank_version" (
	"id" serial PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"source_file" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"question_count" integer DEFAULT 0 NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"changed" integer DEFAULT 0 NOT NULL,
	"retired" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"media_ref" text,
	"media_alt" text,
	"exam_fact" text,
	"lab_step_id" text,
	"interaction" jsonb,
	CONSTRAINT "card_type" CHECK (type IN ('hook','lab','concept','predict','numeric','worked_example','drag_drop','flashcards','audio'))
);
--> statement-breakpoint
CREATE TABLE "card_question" (
	"card_id" text NOT NULL,
	"question_id" text NOT NULL,
	CONSTRAINT "card_question_card_id_question_id_pk" PRIMARY KEY("card_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "class_member" (
	"class_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_member_class_id_user_id_pk" PRIMARY KEY("class_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "class" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instructor_id" uuid NOT NULL,
	"name" text NOT NULL,
	"join_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "lab" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"component" text,
	"default_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "lab_id_format" CHECK ("lab"."id" ~ '^LAB-[0-9]{2}$')
);
--> statement-breakpoint
CREATE TABLE "lab_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"lab_step_id" text,
	"event" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lab_event_kind" CHECK ("lab_event"."event" IN ('started', 'goal_met', 'hint_used', 'value_changed'))
);
--> statement-breakpoint
CREATE TABLE "lab_step" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"lab_id" text NOT NULL,
	"sort_order" smallint NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"config_json" jsonb NOT NULL,
	"goal_expr" text,
	"goal_text" text,
	"hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"success_text" text
);
--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" text PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"title_fr" text,
	"sort_order" smallint NOT NULL,
	"est_minutes" smallint,
	"lab_id" text,
	"authored" boolean DEFAULT false NOT NULL,
	"needs_card_review" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lesson_code_unique" UNIQUE("code"),
	CONSTRAINT "lesson_id_format" CHECK ("lesson"."id" ~ '^B-[0-9]{3}-[0-9]{3}$')
);
--> statement-breakpoint
CREATE TABLE "lesson_progress" (
	"user_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"step" smallint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"tested_out" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lesson_progress_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "mock_exam" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_ids" text[] NOT NULL,
	"score" real,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_account" (
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"email" "citext",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_account_provider_provider_user_id_pk" PRIMARY KEY("provider","provider_user_id")
);
--> statement-breakpoint
CREATE TABLE "option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" text NOT NULL,
	"slot" smallint NOT NULL,
	"text_en" text NOT NULL,
	"text_fr" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"why_not_en" text,
	"why_not_fr" text,
	"bank_version" integer NOT NULL,
	"retired_in" integer,
	CONSTRAINT "option_slot_range" CHECK ("option"."slot" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY NOT NULL,
	"lesson_id" text NOT NULL,
	"stem_en" text NOT NULL,
	"stem_fr" text NOT NULL,
	"bank_version" integer NOT NULL,
	"has_calculation" boolean DEFAULT false NOT NULL,
	"calc_spec" jsonb,
	"image_ref" text,
	"retired_in" integer,
	CONSTRAINT "question_id_format" CHECK ("question"."id" ~ '^B-[0-9]{3}-[0-9]{3}-[0-9]{3}$')
);
--> statement-breakpoint
CREATE TABLE "question_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"bank_version" integer NOT NULL,
	"stem_en" text NOT NULL,
	"stem_fr" text NOT NULL,
	"replaced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_state" (
	"user_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"mastered" boolean DEFAULT false NOT NULL,
	"streak" smallint DEFAULT 0 NOT NULL,
	"last_correct_at" timestamp with time zone,
	"lapses" smallint DEFAULT 0 NOT NULL,
	"stability" real,
	"difficulty" real,
	"due_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_state_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "section" (
	"id" text PRIMARY KEY NOT NULL,
	"number" smallint NOT NULL,
	"title_en" text NOT NULL,
	"title_fr" text,
	"sort_order" smallint NOT NULL,
	"checkpoint_pass_percent" smallint DEFAULT 80 NOT NULL,
	"checkpoint_mastered_sample" real DEFAULT 0.2 NOT NULL,
	CONSTRAINT "section_number_unique" UNIQUE("number"),
	CONSTRAINT "section_id_format" CHECK ("section"."id" ~ '^B-00[1-8]$')
);
--> statement-breakpoint
CREATE TABLE "session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext",
	"email_verified_at" timestamp with time zone,
	"display_name" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"call_sign" text,
	"role" "user_role" DEFAULT 'learner' NOT NULL,
	"is_guest" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_locale" CHECK ("user"."locale" IN ('en', 'fr'))
);
--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_option_id_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."option"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_lab_step_id_lab_step_id_fk" FOREIGN KEY ("lab_step_id") REFERENCES "public"."lab_step"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_question" ADD CONSTRAINT "card_question_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_question" ADD CONSTRAINT "card_question_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_member" ADD CONSTRAINT "class_member_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_member" ADD CONSTRAINT "class_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class" ADD CONSTRAINT "class_instructor_id_user_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_event" ADD CONSTRAINT "lab_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_event" ADD CONSTRAINT "lab_event_lab_step_id_lab_step_id_fk" FOREIGN KEY ("lab_step_id") REFERENCES "public"."lab_step"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_step" ADD CONSTRAINT "lab_step_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_step" ADD CONSTRAINT "lab_step_lab_id_lab_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."lab"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_lab_id_lab_id_fk" FOREIGN KEY ("lab_id") REFERENCES "public"."lab"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_exam" ADD CONSTRAINT "mock_exam_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_account" ADD CONSTRAINT "oauth_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option" ADD CONSTRAINT "option_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option" ADD CONSTRAINT "option_bank_version_bank_version_id_fk" FOREIGN KEY ("bank_version") REFERENCES "public"."bank_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option" ADD CONSTRAINT "option_retired_in_bank_version_id_fk" FOREIGN KEY ("retired_in") REFERENCES "public"."bank_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_bank_version_bank_version_id_fk" FOREIGN KEY ("bank_version") REFERENCES "public"."bank_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_retired_in_bank_version_id_fk" FOREIGN KEY ("retired_in") REFERENCES "public"."bank_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_history" ADD CONSTRAINT "question_history_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_history" ADD CONSTRAINT "question_history_bank_version_bank_version_id_fk" FOREIGN KEY ("bank_version") REFERENCES "public"."bank_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_state" ADD CONSTRAINT "question_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_state" ADD CONSTRAINT "question_state_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_user_q_idx" ON "attempt" USING btree ("user_id","question_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_token_email_idx" ON "auth_token" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "card_lesson_idx" ON "card" USING btree ("lesson_id","sort_order");--> statement-breakpoint
CREATE INDEX "card_question_q_idx" ON "card_question" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "lab_event_step_idx" ON "lab_event" USING btree ("lab_step_id","event");--> statement-breakpoint
CREATE INDEX "lesson_section_idx" ON "lesson" USING btree ("section_id","sort_order");--> statement-breakpoint
CREATE INDEX "oauth_account_user_idx" ON "oauth_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "option_active_slot_idx" ON "option" USING btree ("question_id","slot") WHERE "option"."retired_in" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "option_one_correct_idx" ON "option" USING btree ("question_id") WHERE "option"."is_correct" AND "option"."retired_in" IS NULL;--> statement-breakpoint
CREATE INDEX "question_lesson_idx" ON "question" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "question_state_due_idx" ON "question_state" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");