/**
 * HamPath schema (SPEC §7) as Drizzle tables. `pnpm db:generate` turns changes here into
 * SQL migrations in packages/db/migrations, which are reviewed and committed like code.
 * The spec's "order" column is named sort_order (reserved word).
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Case-insensitive text (citext extension, created in the first migration). */
const citext = customType<{ data: string }>({ dataType: () => "citext" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ------------------------------------------------------------------ content

/** One row per imported ISED bank file. */
export const bankVersion = pgTable("bank_version", {
  id: serial().primaryKey(),
  sha256: text().notNull(),
  sourceFile: text("source_file").notNull(),
  importedAt: ts("imported_at").notNull().defaultNow(),
  questionCount: integer("question_count").notNull().default(0),
  added: integer().notNull().default(0),
  changed: integer().notNull().default(0),
  retired: integer().notNull().default(0),
});

export const section = pgTable(
  "section",
  {
    id: text().primaryKey(),
    number: smallint().notNull().unique(),
    titleEn: text("title_en").notNull(),
    titleFr: text("title_fr"),
    sortOrder: smallint("sort_order").notNull(), // recommended study order
    checkpointPassPercent: smallint("checkpoint_pass_percent").notNull().default(80),
    checkpointMasteredSample: real("checkpoint_mastered_sample").notNull().default(0.2),
  },
  (t) => [check("section_id_format", sql`${t.id} ~ '^B-00[1-8]$'`)],
);

export const lab = pgTable(
  "lab",
  {
    id: text().primaryKey(),
    name: text().notNull(),
    component: text(), // React component name; NULL = placeholder until built
    defaultConfig: jsonb("default_config").notNull().default({}),
  },
  (t) => [check("lab_id_format", sql`${t.id} ~ '^LAB-[0-9]{2}$'`)],
);

export const lesson = pgTable(
  "lesson",
  {
    id: text().primaryKey(), // B-005-004
    sectionId: text("section_id")
      .notNull()
      .references(() => section.id),
    code: text().notNull().unique(), // 5.04
    title: text().notNull(),
    titleFr: text("title_fr"),
    sortOrder: smallint("sort_order").notNull(),
    estMinutes: smallint("est_minutes"),
    labId: text("lab_id").references(() => lab.id),
    authored: boolean().notNull().default(false),
    /** Set by a bank import that adds/changes one of its questions; cleared when content is reloaded. */
    needsCardReview: boolean("needs_card_review").notNull().default(false),
  },
  (t) => [
    check("lesson_id_format", sql`${t.id} ~ '^B-[0-9]{3}-[0-9]{3}$'`),
    index("lesson_section_idx").on(t.sectionId, t.sortOrder),
  ],
);

export const question = pgTable(
  "question",
  {
    id: text().primaryKey(), // B-005-004-001
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id),
    stemEn: text("stem_en").notNull(),
    stemFr: text("stem_fr").notNull(),
    bankVersion: integer("bank_version")
      .notNull()
      .references(() => bankVersion.id),
    hasCalculation: boolean("has_calculation").notNull().default(false),
    calcSpec: jsonb("calc_spec"),
    imageRef: text("image_ref"),
    retiredIn: integer("retired_in").references(() => bankVersion.id), // NULL = in the current bank
  },
  (t) => [
    check("question_id_format", sql`${t.id} ~ '^B-[0-9]{3}-[0-9]{3}-[0-9]{3}$'`),
    index("question_lesson_idx").on(t.lessonId),
  ],
);

/** Previous stems, kept when an import changes a question's wording. */
export const questionHistory = pgTable("question_history", {
  id: bigserial({ mode: "number" }).primaryKey(),
  questionId: text("question_id")
    .notNull()
    .references(() => question.id),
  bankVersion: integer("bank_version")
    .notNull()
    .references(() => bankVersion.id),
  stemEn: text("stem_en").notNull(),
  stemFr: text("stem_fr").notNull(),
  replacedAt: ts("replaced_at").notNull().defaultNow(),
});

/**
 * Opaque UUID ids: the ISED file lists the correct answer first, so a positional id would leak
 * it. Changed option text retires the row and inserts a new one, so attempts keep their text.
 */
export const option = pgTable(
  "option",
  {
    id: uuid().primaryKey().defaultRandom(),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
    slot: smallint().notNull(), // 0 = the correct answer's position in the ISED file
    textEn: text("text_en").notNull(),
    textFr: text("text_fr").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    whyNotEn: text("why_not_en"),
    whyNotFr: text("why_not_fr"),
    bankVersion: integer("bank_version")
      .notNull()
      .references(() => bankVersion.id),
    retiredIn: integer("retired_in").references(() => bankVersion.id),
  },
  (t) => [
    check("option_slot_range", sql`${t.slot} BETWEEN 0 AND 3`),
    uniqueIndex("option_active_slot_idx")
      .on(t.questionId, t.slot)
      .where(sql`${t.retiredIn} IS NULL`),
    uniqueIndex("option_one_correct_idx")
      .on(t.questionId)
      .where(sql`${t.isCorrect} AND ${t.retiredIn} IS NULL`),
  ],
);

/** A lab's setup inside one lesson. */
export const labStep = pgTable("lab_step", {
  id: text().primaryKey(), // 5.04/explore-current
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lesson.id),
  labId: text("lab_id")
    .notNull()
    .references(() => lab.id),
  sortOrder: smallint("sort_order").notNull(),
  title: text().notNull(),
  prompt: text().notNull(),
  configJson: jsonb("config_json").notNull(), // default_config merged with the step's overrides
  goalExpr: text("goal_expr"), // ham-sim goal expression; NULL = free play
  goalText: text("goal_text"),
  hints: jsonb().notNull().default([]),
  successText: text("success_text"),
});

export const CARD_TYPES = [
  "intro",
  "hook",
  "lab",
  "concept",
  "predict",
  "numeric",
  "worked_example",
  "drag_drop",
  "flashcards",
  "audio",
] as const;

export const card = pgTable(
  "card",
  {
    id: text().primaryKey(), // 5.04/05-voltage (stable for deep links)
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id),
    sortOrder: smallint("sort_order").notNull(),
    type: text().notNull(),
    title: text().notNull(),
    bodyMd: text("body_md").notNull().default(""),
    mediaRef: text("media_ref"),
    mediaAlt: text("media_alt"),
    examFact: text("exam_fact"),
    labStepId: text("lab_step_id").references(() => labStep.id),
    interaction: jsonb(),
  },
  (t) => [
    check("card_type", sql.raw(`type IN (${CARD_TYPES.map((x) => `'${x}'`).join(",")})`)),
    index("card_lesson_idx").on(t.lessonId, t.sortOrder),
  ],
);

/** Coverage link: every question needs >= 1 row (enforced by the content check in CI). */
export const cardQuestion = pgTable(
  "card_question",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => card.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.questionId] }), index("card_question_q_idx").on(t.questionId)],
);

// ------------------------------------------------------------------ learners

export const userRole = pgEnum("user_role", ["learner", "instructor", "admin"]);
export const attemptContext = pgEnum("attempt_context", ["check", "checkpoint", "review", "mock", "placement"]);

export const user = pgTable(
  "user",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: citext().unique(), // NULL for guest learners
    emailVerifiedAt: ts("email_verified_at"),
    displayName: text("display_name"),
    locale: text().notNull().default("en"),
    callSign: text("call_sign"),
    role: userRole().notNull().default("learner"),
    isGuest: boolean("is_guest").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [check("user_locale", sql`${t.locale} IN ('en', 'fr')`)],
);

/** Server-side sessions; the cookie holds a random token, the table only its SHA-256. */
export const session = pgTable(
  "session",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

/** Single-use email sign-in links (only the token's SHA-256 is stored). */
export const authToken = pgTable(
  "auth_token",
  {
    tokenHash: text("token_hash").primaryKey(),
    email: citext().notNull(),
    redirectTo: text("redirect_to"),
    createdAt: ts("created_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
  },
  (t) => [index("auth_token_email_idx").on(t.email, t.createdAt)],
);

/** Linked identity-provider accounts (Google now; Apple later). */
export const oauthAccount = pgTable(
  "oauth_account",
  {
    provider: text().notNull(),
    providerUserId: text("provider_user_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: citext(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerUserId] }), index("oauth_account_user_idx").on(t.userId)],
);

/** Append-only (enforced by a trigger): the source of truth for grading and mastery. */
export const attempt = pgTable(
  "attempt",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
    optionId: uuid("option_id")
      .notNull()
      .references(() => option.id),
    correct: boolean().notNull(),
    context: attemptContext().notNull(),
    tryNo: smallint("try_no").notNull().default(1),
    msTaken: integer("ms_taken"),
    /** The checkpoint or mock exam this answer belongs to (NULL for lesson checks and reviews). */
    sessionId: uuid("session_id"),
    /** Idempotency key from the browser: a replayed offline answer is recognised, not counted twice. */
    clientId: uuid("client_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attempt_user_client_idx").on(t.userId, t.clientId),
    index("attempt_user_q_idx").on(t.userId, t.questionId, t.createdAt),
    index("attempt_session_idx").on(t.sessionId),
    index("attempt_user_day_idx").on(t.userId, t.createdAt),
  ],
);

/** Spaced-repetition state per learner per question: FSRS-5 memory state plus the mastery streak. */
export const questionState = pgTable(
  "question_state",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => question.id),
    mastered: boolean().notNull().default(false),
    streak: smallint().notNull().default(0),
    lastCorrectAt: ts("last_correct_at"),
    lapses: smallint().notNull().default(0),
    stability: real(),
    difficulty: real(),
    dueAt: ts("due_at"),
    lastReviewedAt: ts("last_reviewed_at"),
    reps: smallint().notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] }), index("question_state_due_idx").on(t.userId, t.dueAt)],
);

export const lessonProgress = pgTable(
  "lesson_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id),
    step: smallint().notNull().default(0), // furthest screen reached
    startedAt: ts("started_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
    testedOut: boolean("tested_out").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export const labEvent = pgTable(
  "lab_event",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    labStepId: text("lab_step_id").references(() => labStep.id, { onDelete: "set null" }),
    event: text().notNull(),
    payload: jsonb().notNull().default({}),
    /** Idempotency key from the browser (see attempt.client_id). */
    clientId: uuid("client_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lab_event_user_client_idx").on(t.userId, t.clientId),
    check("lab_event_kind", sql`${t.event} IN ('started', 'goal_met', 'hint_used', 'value_changed')`),
    index("lab_event_step_idx").on(t.labStepId, t.event),
  ],
);

export const mockExam = pgTable("mock_exam", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  questionIds: text("question_ids").array().notNull(),
  /** Percent correct, 0..100. */
  score: real(),
  correct: integer(),
  total: integer(),
  passed: boolean(),
  honours: boolean(),
  /** [{ sectionId, correct, total }] */
  sectionBreakdown: jsonb("section_breakdown"),
  /** Null for an untimed mock (WCAG 2.2.1: the learner may turn the time limit off). */
  timeLimitS: integer("time_limit_s").default(10800),
  blueprintVersion: text("blueprint_version"),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
});

/** Section Checkpoint: every unmastered question in the section plus a sample of mastered ones. */
export const checkpoint = pgTable(
  "checkpoint",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => section.id),
    questionIds: text("question_ids").array().notNull(),
    correct: integer(),
    total: integer(),
    score: real(),
    passed: boolean(),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("checkpoint_user_idx").on(t.userId, t.sectionId)],
);

/** Earned by scoring the pass mark (80%) on a section's Checkpoint. */
export const sectionBadge = pgTable(
  "section_badge",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sectionId: text("section_id")
      .notNull()
      .references(() => section.id),
    checkpointId: uuid("checkpoint_id").references(() => checkpoint.id, { onDelete: "set null" }),
    earnedAt: ts("earned_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sectionId] })],
);

export const klass = pgTable("class", {
  id: uuid().primaryKey().defaultRandom(),
  instructorId: uuid("instructor_id")
    .notNull()
    .references(() => user.id),
  name: text().notNull(),
  joinCode: text("join_code").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const classMember = pgTable(
  "class_member",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => klass.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.userId] })],
);
