CREATE TABLE "class_assignment" (
	"class_id" uuid NOT NULL,
	"section_id" text NOT NULL,
	"due_on" date,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_assignment_class_id_section_id_pk" PRIMARY KEY("class_id","section_id")
);
--> statement-breakpoint
CREATE TABLE "live_answer" (
	"quiz_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" text NOT NULL,
	"option_id" uuid NOT NULL,
	"correct" boolean NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_answer_quiz_id_user_id_question_id_pk" PRIMARY KEY("quiz_id","user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "live_quiz" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"question_ids" text[] NOT NULL,
	"current" smallint DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'lobby' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_quiz_state" CHECK ("live_quiz"."state" IN ('lobby', 'question', 'reveal', 'ended'))
);
--> statement-breakpoint
ALTER TABLE "class_assignment" ADD CONSTRAINT "class_assignment_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_assignment" ADD CONSTRAINT "class_assignment_section_id_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_answer" ADD CONSTRAINT "live_answer_quiz_id_live_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."live_quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_answer" ADD CONSTRAINT "live_answer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_answer" ADD CONSTRAINT "live_answer_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_answer" ADD CONSTRAINT "live_answer_option_id_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."option"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_quiz" ADD CONSTRAINT "live_quiz_class_id_class_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."class"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_quiz_class_idx" ON "live_quiz" USING btree ("class_id","created_at");