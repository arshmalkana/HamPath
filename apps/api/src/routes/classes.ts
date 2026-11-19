/**
 * Instructor / club mode (Step 31; SPEC tables `class`, `class_member`, `GET /classes/:id/dashboard`).
 *
 * - An instructor (role instructor or admin) creates a class and shares its join code.
 * - Learners join with the code; the instructor assigns sections and sees each learner's progress
 *   and weak topics.
 * - Live quiz: the instructor projects questions and advances them; members answer from their
 *   phones. Everyone polls GET /live/:id. Live answers are a classroom game and don't touch
 *   mastery or the review schedule (a rushed round shouldn't reshape anyone's FSRS state).
 */
import { createHash, randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { lessonCode } from "@hampath/content";
import type { Pool } from "@hampath/db";
import { HttpError, requireRole, requireUser, type SessionUser } from "../auth.ts";
import { publicQuestions, questionFacts } from "../grading.ts";
import { resolveSectionId, shuffled } from "./practice.ts";

/** Unambiguous characters for join codes (no 0/O, 1/I/L). */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
export const LIVE_DEFAULT_QUESTIONS = 10;
/** A lesson is a weak topic for a learner below this accuracy over at least WEAK_MIN attempts. */
const WEAK_BELOW = 0.7;
const WEAK_MIN = 3;

const CreateBody = z.strictObject({ name: z.string().trim().min(1).max(80) });
const JoinBody = z.strictObject({
  code: z.string().trim().toUpperCase().length(CODE_LENGTH),
  display_name: z.string().trim().min(1).max(60).optional(),
});
const AssignBody = z.strictObject({
  section: z.union([z.string(), z.number()]).transform(String),
  due_on: z.iso.date().optional(),
});
const LiveBody = z
  .strictObject({
    section: z.union([z.string(), z.number()]).transform(String).optional(),
    questions: z.number().int().min(1).max(30).default(LIVE_DEFAULT_QUESTIONS),
  })
  .default({ questions: LIVE_DEFAULT_QUESTIONS });
const AnswerBody = z.strictObject({ question_id: z.string(), option_id: z.uuid() });

interface ClassRow {
  id: string;
  name: string;
  join_code: string;
  instructor_id: string;
}
type LiveState = "lobby" | "question" | "reveal" | "ended";
interface LiveRow {
  id: string;
  class_id: string;
  question_ids: string[];
  current: number;
  state: LiveState;
  instructor_id: string;
}

const learnerName = (r: { display_name: string | null; call_sign: string | null; email: string | null }, n: number) =>
  r.display_name ?? r.call_sign ?? r.email?.split("@")[0] ?? `Learner ${n}`;

export function classRoutes(app: FastifyInstance, pool: Pool) {
  async function loadClass(id: string): Promise<ClassRow> {
    if (!z.uuid().safeParse(id).success) throw new HttpError(404, "No such class");
    const { rows } = await pool.query<ClassRow>("SELECT * FROM class WHERE id = $1", [id]);
    if (!rows[0]) throw new HttpError(404, "No such class");
    return rows[0];
  }
  const isInstructor = (c: ClassRow, u: SessionUser) => c.instructor_id === u.id || u.role === "admin";
  async function isMember(classId: string, userId: string) {
    const { rows } = await pool.query("SELECT 1 FROM class_member WHERE class_id = $1 AND user_id = $2", [
      classId,
      userId,
    ]);
    return rows.length > 0;
  }
  /** The class, for its instructor (or an admin) only. */
  async function asInstructor(id: string, u: SessionUser) {
    const c = await loadClass(id);
    if (!isInstructor(c, u)) throw new HttpError(403, "Only this class's instructor can do that");
    return c;
  }
  /** The class, for its instructor or a member. */
  async function asMemberOrInstructor(id: string, u: SessionUser) {
    const c = await loadClass(id);
    if (!isInstructor(c, u) && !(await isMember(c.id, u.id))) throw new HttpError(403, "Join the class first");
    return c;
  }

  async function assignments(classId: string) {
    const { rows } = await pool.query<{ sectionId: string; number: number; title: string; dueOn: string | null }>(
      `SELECT a.section_id AS "sectionId", s.number, s.title_en AS title, to_char(a.due_on, 'YYYY-MM-DD') AS "dueOn"
         FROM class_assignment a JOIN section s ON s.id = a.section_id
        WHERE a.class_id = $1 ORDER BY s.number`,
      [classId],
    );
    return rows;
  }
  async function runningLive(classId: string) {
    const { rows } = await pool.query<{ id: string; state: LiveState }>(
      "SELECT id, state FROM live_quiz WHERE class_id = $1 AND state <> 'ended' ORDER BY created_at DESC LIMIT 1",
      [classId],
    );
    return rows[0] ?? null;
  }

  // ---- Classes -----------------------------------------------------------------------------

  app.post("/classes", async (req) => {
    const user = await requireRole(pool, req, "instructor", "admin");
    const { name } = CreateBody.parse(req.body);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
      const { rows } = await pool.query<{ id: string }>(
        "INSERT INTO class (instructor_id, name, join_code) VALUES ($1,$2,$3) ON CONFLICT (join_code) DO NOTHING RETURNING id",
        [user.id, name, code],
      );
      if (rows[0]) return { id: rows[0].id, name, joinCode: code };
    }
    throw new HttpError(503, "Couldn't make a unique join code; try again");
  });

  /** Classes you teach and classes you've joined. */
  app.get("/classes", async (req) => {
    const user = await requireUser(pool, req);
    const { rows: teaching } = await pool.query(
      `SELECT c.id, c.name, c.join_code AS "joinCode", count(m.user_id)::int AS members
         FROM class c LEFT JOIN class_member m ON m.class_id = c.id
        WHERE c.instructor_id = $1 GROUP BY c.id ORDER BY c.created_at DESC`,
      [user.id],
    );
    const { rows: joined } = await pool.query(
      `SELECT c.id, c.name, u.display_name AS instructor,
              (SELECT l.id FROM live_quiz l WHERE l.class_id = c.id AND l.state <> 'ended' ORDER BY l.created_at DESC LIMIT 1) AS "liveQuizId"
         FROM class_member m JOIN class c ON c.id = m.class_id JOIN "user" u ON u.id = c.instructor_id
        WHERE m.user_id = $1 ORDER BY m.joined_at DESC`,
      [user.id],
    );
    return { canTeach: user.role === "instructor" || user.role === "admin", teaching, joined };
  });

  app.post("/classes/join", async (req) => {
    const user = await requireUser(pool, req);
    const body = JoinBody.parse(req.body);
    const { rows } = await pool.query<ClassRow>("SELECT * FROM class WHERE join_code = $1", [body.code]);
    if (!rows[0]) throw new HttpError(404, "No class has that code. Check it with your instructor.");
    if (body.display_name)
      await pool.query(`UPDATE "user" SET display_name = $2 WHERE id = $1`, [user.id, body.display_name]);
    await pool.query("INSERT INTO class_member (class_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [
      rows[0].id,
      user.id,
    ]);
    return { id: rows[0].id, name: rows[0].name };
  });

  app.get<{ Params: { id: string } }>("/classes/:id", async (req) => {
    const user = await requireUser(pool, req);
    const c = await asMemberOrInstructor(req.params.id, user);
    const live = await runningLive(c.id);
    return {
      id: c.id,
      name: c.name,
      isInstructor: isInstructor(c, user),
      joinCode: isInstructor(c, user) ? c.join_code : undefined,
      assignments: await assignments(c.id),
      liveQuiz: live,
    };
  });

  app.post<{ Params: { id: string } }>("/classes/:id/assignments", async (req) => {
    const user = await requireUser(pool, req);
    const c = await asInstructor(req.params.id, user);
    const body = AssignBody.parse(req.body);
    const sectionId = resolveSectionId(body.section);
    await pool.query(
      `INSERT INTO class_assignment (class_id, section_id, due_on) VALUES ($1,$2,$3)
       ON CONFLICT (class_id, section_id) DO UPDATE SET due_on = EXCLUDED.due_on`,
      [c.id, sectionId, body.due_on ?? null],
    );
    return { assignments: await assignments(c.id) };
  });

  app.delete<{ Params: { id: string; section: string } }>("/classes/:id/assignments/:section", async (req) => {
    const user = await requireUser(pool, req);
    const c = await asInstructor(req.params.id, user);
    await pool.query("DELETE FROM class_assignment WHERE class_id = $1 AND section_id = $2", [
      c.id,
      resolveSectionId(req.params.section),
    ]);
    return { assignments: await assignments(c.id) };
  });

  /** Instructor view: each learner's progress and weak topics, plus the class's weakest lessons. */
  app.get<{ Params: { id: string } }>("/classes/:id/dashboard", async (req) => {
    const user = await requireUser(pool, req);
    const c = await asInstructor(req.params.id, user);
    const assigned = await assignments(c.id);
    const assignedIds = assigned.map((a) => a.sectionId);
    const { rows: members } = await pool.query<{
      id: string;
      display_name: string | null;
      call_sign: string | null;
      email: string | null;
      joined_at: Date;
    }>(
      `SELECT u.id, u.display_name, u.call_sign, u.email, m.joined_at
         FROM class_member m JOIN "user" u ON u.id = m.user_id WHERE m.class_id = $1 ORDER BY m.joined_at`,
      [c.id],
    );
    const ids = members.map((m) => m.id);
    const [{ rows: totals }, { rows: done }, { rows: mastery }, { rows: activity }, { rows: accuracy }] =
      await Promise.all([
        pool.query<{ section_id: string; lessons: number; questions: number }>(
          `SELECT l.section_id, count(DISTINCT l.id)::int AS lessons, count(q.id)::int AS questions
           FROM lesson l JOIN question q ON q.lesson_id = l.id AND q.retired_in IS NULL GROUP BY l.section_id`,
        ),
        pool.query<{ user_id: string; section_id: string; n: number }>(
          `SELECT lp.user_id, l.section_id, count(*)::int AS n FROM lesson_progress lp JOIN lesson l ON l.id = lp.lesson_id
          WHERE lp.user_id = ANY($1) AND lp.completed_at IS NOT NULL GROUP BY lp.user_id, l.section_id`,
          [ids],
        ),
        pool.query<{ user_id: string; section_id: string; n: number }>(
          `SELECT qs.user_id, l.section_id, count(*)::int AS n FROM question_state qs
           JOIN question q ON q.id = qs.question_id JOIN lesson l ON l.id = q.lesson_id
          WHERE qs.user_id = ANY($1) AND qs.mastered GROUP BY qs.user_id, l.section_id`,
          [ids],
        ),
        pool.query<{ user_id: string; last: Date }>(
          "SELECT user_id, max(created_at) AS last FROM attempt WHERE user_id = ANY($1) GROUP BY user_id",
          [ids],
        ),
        pool.query<{ user_id: string; lesson_id: string; n: number; right: number }>(
          `SELECT a.user_id, q.lesson_id, count(*)::int AS n, count(*) FILTER (WHERE a.correct)::int AS right
           FROM attempt a JOIN question q ON q.id = a.question_id
          WHERE a.user_id = ANY($1) AND a.try_no = 1 GROUP BY a.user_id, q.lesson_id`,
          [ids],
        ),
      ]);
    const { rows: lessonMeta } = await pool.query<{ id: string; title: string }>("SELECT id, title FROM lesson");
    const title = new Map(lessonMeta.map((l) => [l.id, l.title]));
    const sum = (rows: { user_id: string; section_id: string; n: number }[], uid: string, secs?: string[]) =>
      rows.filter((r) => r.user_id === uid && (!secs || secs.includes(r.section_id))).reduce((n, r) => n + r.n, 0);
    const allQuestions = totals.reduce((n, t) => n + t.questions, 0);
    const assignedLessons = totals.filter((t) => assignedIds.includes(t.section_id)).reduce((n, t) => n + t.lessons, 0);
    const weakOf = (uid: string) =>
      accuracy
        .filter((a) => a.user_id === uid && a.n >= WEAK_MIN && a.right / a.n < WEAK_BELOW)
        .sort((x, y) => x.right / x.n - y.right / y.n)
        .slice(0, 3)
        .map((a) => ({
          lessonId: a.lesson_id,
          code: lessonCode(a.lesson_id),
          title: title.get(a.lesson_id) ?? "",
          accuracy: Math.round((100 * a.right) / a.n),
        }));
    const learners = members.map((m, i) => ({
      userId: m.id,
      name: learnerName(m, i + 1),
      joinedAt: m.joined_at,
      lastActive: activity.find((a) => a.user_id === m.id)?.last ?? null,
      lessonsCompleted: sum(done, m.id),
      masteryPercent: allQuestions ? Math.round((100 * sum(mastery, m.id)) / allQuestions) : 0,
      assignedProgress: assignedLessons ? Math.round((100 * sum(done, m.id, assignedIds)) / assignedLessons) : null,
      weakTopics: weakOf(m.id),
    }));
    // The class's weakest lessons: first-try accuracy pooled over learners who tried them.
    const pooled = new Map<string, { n: number; right: number; learners: number }>();
    for (const a of accuracy) {
      const e = pooled.get(a.lesson_id) ?? { n: 0, right: 0, learners: 0 };
      pooled.set(a.lesson_id, { n: e.n + a.n, right: e.right + a.right, learners: e.learners + 1 });
    }
    const classWeak = [...pooled.entries()]
      .filter(([, e]) => e.n >= WEAK_MIN && e.right / e.n < WEAK_BELOW)
      .sort(([, x], [, y]) => x.right / x.n - y.right / y.n)
      .slice(0, 8)
      .map(([id, e]) => ({
        lessonId: id,
        code: lessonCode(id),
        title: title.get(id) ?? "",
        accuracy: Math.round((100 * e.right) / e.n),
        learners: e.learners,
      }));
    return { id: c.id, name: c.name, joinCode: c.join_code, assignments: assigned, learners, weakTopics: classWeak };
  });

  // ---- Live quiz ---------------------------------------------------------------------------

  async function loadLive(id: string): Promise<LiveRow> {
    if (!z.uuid().safeParse(id).success) throw new HttpError(404, "No such live quiz");
    const { rows } = await pool.query<LiveRow>(
      "SELECT l.*, c.instructor_id FROM live_quiz l JOIN class c ON c.id = l.class_id WHERE l.id = $1",
      [id],
    );
    if (!rows[0]) throw new HttpError(404, "No such live quiz");
    return rows[0];
  }

  app.post<{ Params: { id: string } }>("/classes/:id/live", async (req) => {
    const user = await requireUser(pool, req);
    const c = await asInstructor(req.params.id, user);
    const body = LiveBody.parse(req.body ?? undefined);
    // From the chosen section, else the assigned ones, else the whole course.
    const sections = body.section
      ? [resolveSectionId(body.section)]
      : (await assignments(c.id)).map((a) => a.sectionId);
    const { rows } = await pool.query<{ id: string }>(
      `SELECT q.id FROM question q JOIN lesson l ON l.id = q.lesson_id
        WHERE q.retired_in IS NULL AND (cardinality($1::text[]) = 0 OR l.section_id = ANY($1))`,
      [sections],
    );
    const ids = shuffled(rows.map((r) => r.id)).slice(0, body.questions);
    await pool.query("UPDATE live_quiz SET state = 'ended' WHERE class_id = $1 AND state <> 'ended'", [c.id]);
    const { rows: q } = await pool.query<{ id: string }>(
      "INSERT INTO live_quiz (class_id, question_ids) VALUES ($1,$2) RETURNING id",
      [c.id, ids],
    );
    return { id: q[0]!.id };
  });

  /** Instructor: lobby → question 1 → reveal → question 2 → … → ended. */
  app.post<{ Params: { id: string } }>("/live/:id/advance", async (req) => {
    const user = await requireUser(pool, req);
    const q = await loadLive(req.params.id);
    if (q.instructor_id !== user.id && user.role !== "admin")
      throw new HttpError(403, "Only the instructor runs the quiz");
    let { state, current } = q;
    if (state === "lobby") state = "question";
    else if (state === "question") state = "reveal";
    else if (state === "reveal") {
      if (current + 1 < q.question_ids.length) {
        current++;
        state = "question";
      } else state = "ended";
    }
    await pool.query("UPDATE live_quiz SET state = $2, current = $3, updated_at = now() WHERE id = $1", [
      q.id,
      state,
      current,
    ]);
    return liveView(await loadLive(q.id), user);
  });

  app.post<{ Params: { id: string } }>("/live/:id/answer", async (req) => {
    const user = await requireUser(pool, req);
    const q = await loadLive(req.params.id);
    if (!(await isMember(q.class_id, user.id))) throw new HttpError(403, "Join the class first");
    const body = AnswerBody.parse(req.body);
    if (q.state !== "question" || q.question_ids[q.current] !== body.question_id) {
      throw new HttpError(409, "That question isn't open any more");
    }
    const facts = (await questionFacts(pool, [body.question_id])).get(body.question_id);
    const opt = facts?.options.get(body.option_id);
    if (!opt) throw new HttpError(400, "That option does not belong to that question");
    // First answer stands, as on a real exam sheet.
    await pool.query(
      `INSERT INTO live_answer (quiz_id, user_id, question_id, option_id, correct) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (quiz_id, user_id, question_id) DO NOTHING`,
      [q.id, user.id, body.question_id, body.option_id, opt.isCorrect],
    );
    return liveView(q, user);
  });

  app.get<{ Params: { id: string } }>("/live/:id", async (req) => {
    const user = await requireUser(pool, req);
    const q = await loadLive(req.params.id);
    if (q.instructor_id !== user.id && user.role !== "admin" && !(await isMember(q.class_id, user.id))) {
      throw new HttpError(403, "Join the class first");
    }
    return liveView(q, user);
  });

  /**
   * What a viewer may see. The correct option and the answer counts appear only at "reveal" (the
   * projector shows how many have answered meanwhile); learners see their own choice.
   */
  async function liveView(q: LiveRow, user: SessionUser) {
    const instructor = q.instructor_id === user.id || user.role === "admin";
    const qid = q.state === "question" || q.state === "reveal" ? q.question_ids[q.current]! : null;
    const { rows: members } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM class_member WHERE class_id = $1",
      [q.class_id],
    );
    const base = {
      id: q.id,
      classId: q.class_id,
      state: q.state,
      number: q.current + 1,
      total: q.question_ids.length,
      members: members[0]!.n,
      isInstructor: instructor,
    };
    if (!qid) {
      if (q.state !== "ended") return { ...base, question: null };
      // Final scores: correct answers per learner, best first (names shown to the instructor only).
      const { rows } = await pool.query<{
        user_id: string;
        display_name: string | null;
        call_sign: string | null;
        email: string | null;
        n_right: number;
      }>(
        `SELECT a.user_id, u.display_name, u.call_sign, u.email, count(*) FILTER (WHERE a.correct)::int AS n_right
           FROM live_answer a JOIN "user" u ON u.id = a.user_id WHERE a.quiz_id = $1
          GROUP BY a.user_id, u.display_name, u.call_sign, u.email ORDER BY n_right DESC`,
        [q.id],
      );
      const mine = rows.find((r) => r.user_id === user.id);
      return {
        ...base,
        question: null,
        scores: instructor ? rows.map((r, i) => ({ name: learnerName(r, i + 1), right: r.n_right })) : undefined,
        myScore: instructor ? undefined : (mine?.n_right ?? 0),
      };
    }
    const [shuffledOnce] = await publicQuestions(pool, [qid]);
    // One fixed order per quiz: the projector's A–D must match every phone, and buttons mustn't
    // move between polls (publicQuestions shuffles on every call).
    const rank = (optionId: string) =>
      createHash("sha1")
        .update(q.id + optionId)
        .digest("hex");
    const question = {
      ...shuffledOnce!,
      options: [...shuffledOnce!.options].sort((x, y) => rank(x.id).localeCompare(rank(y.id))),
    };
    const { rows: answers } = await pool.query<{ user_id: string; option_id: string; correct: boolean }>(
      "SELECT user_id, option_id, correct FROM live_answer WHERE quiz_id = $1 AND question_id = $2",
      [q.id, qid],
    );
    const reveal = q.state === "reveal";
    const facts = reveal ? (await questionFacts(pool, [qid])).get(qid) : undefined;
    const mine = answers.find((a) => a.user_id === user.id);
    return {
      ...base,
      question,
      answered: answers.length,
      myAnswer: mine?.option_id ?? null,
      correctOptionId: reveal ? (facts?.correctOptionId ?? null) : null,
      counts: reveal
        ? Object.fromEntries(question!.options.map((o) => [o.id, answers.filter((a) => a.option_id === o.id).length]))
        : null,
      myResult: reveal && mine ? mine.correct : null,
    };
  }
}
