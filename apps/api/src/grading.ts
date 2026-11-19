/**
 * Server-side grading shared by the lesson Check, Daily Review, Section Checkpoints and mock exams.
 * Every graded answer appends an `attempt` row and moves the question's FSRS/mastery state.
 */
import { runCalculation, type CalcSpec } from "@hampath/ham-sim";
import { tx, type Client, type Pool } from "@hampath/db";
import { nextState, type Context, type QState } from "./mastery.ts";

type Db = Pool | Client;

export interface TeachLink {
  /** Card id, or null when the lesson has no teaching cards yet (links to the lesson). */
  id: string | null;
  title: string;
  href: string;
}

const STATE_COLUMNS = `mastered, streak, last_correct_at AS "lastCorrectAt", lapses, due_at AS "dueAt",
  stability, difficulty, last_reviewed_at AS "lastReviewedAt", reps`;

/** Move one question's state for one learner; returns the new state (null = unchanged). */
export async function applyAnswer(
  c: Client,
  userId: string,
  questionId: string,
  facts: { correct: boolean; context: Context; tryNo: number; at: Date },
): Promise<QState | null> {
  const { rows } = await c.query<QState>(
    `SELECT ${STATE_COLUMNS} FROM question_state WHERE user_id = $1 AND question_id = $2 FOR UPDATE`,
    [userId, questionId],
  );
  const next = nextState(rows[0] ?? null, facts);
  if (!next) return null;
  await c.query(
    `INSERT INTO question_state (user_id, question_id, mastered, streak, last_correct_at, lapses, due_at,
                                 stability, difficulty, last_reviewed_at, reps, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (user_id, question_id) DO UPDATE SET mastered=EXCLUDED.mastered, streak=EXCLUDED.streak,
       last_correct_at=EXCLUDED.last_correct_at, lapses=EXCLUDED.lapses, due_at=EXCLUDED.due_at,
       stability=EXCLUDED.stability, difficulty=EXCLUDED.difficulty, last_reviewed_at=EXCLUDED.last_reviewed_at,
       reps=EXCLUDED.reps, updated_at=EXCLUDED.updated_at`,
    [
      userId,
      questionId,
      next.mastered,
      next.streak,
      next.lastCorrectAt,
      next.lapses,
      next.dueAt,
      next.stability,
      next.difficulty,
      next.lastReviewedAt,
      next.reps,
      facts.at,
    ],
  );
  return next;
}

export async function insertAttempt(
  c: Client,
  a: {
    userId: string;
    questionId: string;
    optionId: string;
    correct: boolean;
    context: Context;
    tryNo: number;
    msTaken?: number | null;
    sessionId?: string | null;
    /** Browser idempotency key: the same key twice inserts once. */
    clientId?: string | null;
    at: Date;
  },
): Promise<boolean> {
  const res = await c.query(
    `INSERT INTO attempt (user_id, question_id, option_id, correct, context, try_no, ms_taken, session_id, client_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (user_id, client_id) DO NOTHING`,
    [
      a.userId,
      a.questionId,
      a.optionId,
      a.correct,
      a.context,
      a.tryNo,
      a.msTaken ?? null,
      a.sessionId ?? null,
      a.clientId ?? null,
      a.at,
    ],
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * "See it again" for each question: the Learn card that explains it, then practice cards, then the
 * lab; for a lesson that has no teaching cards yet, the lesson itself.
 */
export async function teachLinks(db: Db, questionIds: string[]): Promise<Map<string, TeachLink>> {
  const out = new Map<string, TeachLink>();
  if (!questionIds.length) return out;
  const { rows } = await db.query<{ question_id: string; id: string; title: string; code: string }>(
    `SELECT DISTINCT ON (cq.question_id) cq.question_id, c.id, c.title, l.code
       FROM card_question cq JOIN card c ON c.id = cq.card_id JOIN lesson l ON l.id = c.lesson_id
      WHERE cq.question_id = ANY($1)
      ORDER BY cq.question_id,
               CASE c.type WHEN 'concept' THEN 0 WHEN 'worked_example' THEN 1 WHEN 'lab' THEN 5 WHEN 'hook' THEN 9 ELSE 3 END,
               c.sort_order`,
    [questionIds],
  );
  for (const r of rows) {
    out.set(r.question_id, { id: r.id, title: r.title, href: `/lessons/${r.code}?card=${encodeURIComponent(r.id)}` });
  }
  const missing = questionIds.filter((q) => !out.has(q));
  if (missing.length) {
    const { rows: ls } = await db.query<{ qid: string; code: string; title: string }>(
      `SELECT q.id AS qid, l.code, l.title FROM question q JOIN lesson l ON l.id = q.lesson_id WHERE q.id = ANY($1)`,
      [missing],
    );
    for (const l of ls) out.set(l.qid, { id: null, title: `${l.code} ${l.title}`, href: `/lessons/${l.code}` });
  }
  return out;
}

export interface QuestionFacts {
  questionId: string;
  lessonId: string;
  sectionId: string;
  correctOptionId: string;
  calcSpec: CalcSpec | null;
  options: Map<string, { isCorrect: boolean; whyNot: string | null }>;
}

/** Correct answers and Why not? notes for a set of questions (server-side only). */
export async function questionFacts(db: Db, questionIds: string[]): Promise<Map<string, QuestionFacts>> {
  const { rows } = await db.query<{
    qid: string;
    lesson_id: string;
    calc_spec: CalcSpec | null;
    oid: string;
    is_correct: boolean;
    why_not: string | null;
  }>(
    `SELECT q.id AS qid, q.lesson_id, q.calc_spec, o.id AS oid, o.is_correct, o.why_not_en AS why_not
       FROM question q JOIN option o ON o.question_id = q.id AND o.retired_in IS NULL
      WHERE q.id = ANY($1) AND q.retired_in IS NULL`,
    [questionIds],
  );
  const out = new Map<string, QuestionFacts>();
  for (const r of rows) {
    let f = out.get(r.qid);
    if (!f) {
      f = {
        questionId: r.qid,
        lessonId: r.lesson_id,
        sectionId: r.lesson_id.slice(0, 5),
        correctOptionId: "",
        calcSpec: r.calc_spec,
        options: new Map(),
      };
      out.set(r.qid, f);
    }
    f.options.set(r.oid, { isCorrect: r.is_correct, whyNot: r.why_not });
    if (r.is_correct) f.correctOptionId = r.oid;
  }
  return out;
}

export const workedSolution = (spec: CalcSpec | null) => (spec ? runCalculation(spec).steps : null);

export interface GradedAnswer {
  questionId: string;
  lessonId: string;
  sectionId: string;
  chosenOptionId: string | null;
  correct: boolean;
  correctOptionId: string;
  whyNot: string | null;
  workedSolution: string[] | null;
  teach: TeachLink | null;
}

/**
 * Grade a whole quiz (checkpoint or mock) submitted at once. Unanswered questions score as wrong
 * but leave no attempt and don't move the learner's memory state (there is no evidence either way).
 */
export async function gradeBatch(
  pool: Pool,
  userId: string,
  questionIds: string[],
  answers: Map<string, string>,
  context: Context,
  sessionId: string,
): Promise<GradedAnswer[]> {
  const facts = await questionFacts(pool, questionIds);
  const links = await teachLinks(pool, questionIds);
  const at = new Date();
  return tx(pool, async (c) => {
    const out: GradedAnswer[] = [];
    for (const qid of questionIds) {
      const f = facts.get(qid);
      if (!f) continue; // retired since the quiz was built
      const chosen = answers.get(qid) ?? null;
      const opt = chosen ? f.options.get(chosen) : undefined;
      const correct = Boolean(opt?.isCorrect);
      if (chosen && opt) {
        await insertAttempt(c, {
          userId,
          questionId: qid,
          optionId: chosen,
          correct,
          context,
          tryNo: 1,
          sessionId,
          at,
        });
        await applyAnswer(c, userId, qid, { correct, context, tryNo: 1, at });
      }
      out.push({
        questionId: qid,
        lessonId: f.lessonId,
        sectionId: f.sectionId,
        chosenOptionId: opt ? chosen : null,
        correct,
        correctOptionId: f.correctOptionId,
        whyNot: correct || !opt ? null : opt.whyNot,
        workedSolution: correct ? null : workedSolution(f.calcSpec),
        teach: links.get(qid) ?? null,
      });
    }
    return out;
  });
}

/** Public question payload: stem and shuffled options, never correctness. */
export async function publicQuestions(db: Db, questionIds: string[]) {
  const { rows } = await db.query<{
    id: string;
    stem: string;
    lessonId: string;
    options: { id: string; text: string }[];
  }>(
    `SELECT q.id, q.stem_en AS stem, q.lesson_id AS "lessonId",
            json_agg(json_build_object('id', o.id, 'text', o.text_en) ORDER BY random()) AS options
       FROM question q JOIN option o ON o.question_id = q.id AND o.retired_in IS NULL
      WHERE q.id = ANY($1) AND q.retired_in IS NULL
      GROUP BY q.id`,
    [questionIds],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return questionIds.map((id) => byId.get(id)).filter((q): q is NonNullable<typeof q> => Boolean(q));
}
