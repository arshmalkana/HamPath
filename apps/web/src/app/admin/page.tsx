import type { Metadata } from "next";
import Link from "next/link";
import { serverApi } from "@/lib/server";

export const metadata: Metadata = { title: "Course analytics" };

interface Analytics {
  flagBelow: number;
  minAnswers: number;
  questions: {
    questionId: string;
    lessonCode: string;
    stem: string;
    learners: number;
    firstTryRate: number;
    flagged: boolean;
    teach: { title: string; href: string } | null;
  }[];
  labs: {
    labId: string;
    name: string;
    started: number;
    completionRate: number | null;
    hintRate: number | null;
    hintsPerStart: number | null;
    steps: {
      stepId: string;
      title: string;
      started: number;
      completed: number;
      completionRate: number | null;
      hintRate: number | null;
    }[];
  }[];
  lessons: {
    lessonId: string;
    code: string;
    title: string;
    started: number;
    finished: number;
    testedOut: number;
    finishRate: number | null;
    dropOff: number;
    mostCommonStop: { step: number; screen: string; learners: number } | null;
  }[];
}

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);

/** Step 30: where learners struggle. Admins only (role admin). */
export default async function AdminPage() {
  const res = await serverApi<Analytics>("/admin/analytics");
  if (!res.ok) {
    return (
      <main className="container page" id="main">
        <div className="notice" role="alert">
          <h2>{res.status === 403 ? "Admins only" : "That didn’t load"}</h2>
          <p>{res.status === 403 ? "Sign in with an admin account to see course analytics." : res.error}</p>
        </div>
      </main>
    );
  }
  const a = res.data;
  const flagged = a.questions.filter((q) => q.flagged);
  const answered = a.questions.filter((q) => q.learners >= a.minAnswers);
  const lowest = answered.filter((q) => !q.flagged).slice(0, 15);
  const labs = [...a.labs].sort((x, y) => (x.completionRate ?? 2) - (y.completionRate ?? 2));
  const lessons = a.lessons.filter((l) => l.started > 0).sort((x, y) => y.dropOff - x.dropOff);

  return (
    <main className="container page" id="main">
      <div className="page-head">
        <p className="screen-kicker">Admin</p>
        <h1 className="page-title">Course analytics</h1>
        <p className="page-lead">
          {a.questions.length} questions answered at least once, {answered.length} by {a.minAnswers} or more learners.{" "}
          {flagged.length
            ? `${flagged.length} fall below ${pct(a.flagBelow)} first-try success.`
            : `None falls below ${pct(a.flagBelow)} first-try success.`}
        </p>
      </div>

      <section className="map-section" aria-labelledby="flagged">
        <h2 className="section-title" id="flagged">
          Flagged questions
        </h2>
        <p className="field-help">
          First try is each learner’s first answer to the question, anywhere in the course. A flag means the teaching
          card may need work; the link opens it.
        </p>
        {flagged.length ? <QuestionTable rows={flagged} /> : <p>No question is flagged yet.</p>}
      </section>

      {lowest.length > 0 && (
        <section className="map-section" aria-labelledby="lowest">
          <h2 className="section-title" id="lowest">
            Lowest first-try rates, not flagged
          </h2>
          <QuestionTable rows={lowest} />
        </section>
      )}

      <section className="map-section" aria-labelledby="labs">
        <h2 className="section-title" id="labs">
          Labs: completion and hints
        </h2>
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="labs">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Lab</th>
                <th scope="col" className="num">
                  Started
                </th>
                <th scope="col" className="num">
                  Completed
                </th>
                <th scope="col" className="num">
                  Used a hint
                </th>
                <th scope="col" className="num">
                  Hints per start
                </th>
              </tr>
            </thead>
            <tbody>
              {labs.map((l) => (
                <tr key={l.labId}>
                  <th scope="row">
                    <details>
                      <summary>
                        {l.labId} {l.name}
                      </summary>
                      <ul className="admin-steps">
                        {l.steps.map((s) => (
                          <li key={s.stepId}>
                            {s.title}: {s.started} started, {pct(s.completionRate)} completed, {pct(s.hintRate)} used a
                            hint
                          </li>
                        ))}
                      </ul>
                    </details>
                  </th>
                  <td className="num">{l.started}</td>
                  <td className="num">{pct(l.completionRate)}</td>
                  <td className="num">{pct(l.hintRate)}</td>
                  <td className="num">{l.hintsPerStart === null ? "–" : l.hintsPerStart.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="map-section" aria-labelledby="dropoff">
        <h2 className="section-title" id="dropoff">
          Drop-off by lesson
        </h2>
        <p className="field-help">
          Learners who started a lesson but haven’t finished it. Tested-out lessons are left out.
        </p>
        {lessons.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="dropoff">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Lesson</th>
                  <th scope="col" className="num">
                    Started
                  </th>
                  <th scope="col" className="num">
                    Finished
                  </th>
                  <th scope="col" className="num">
                    Dropped
                  </th>
                  <th scope="col">Most stop at</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((l) => (
                  <tr key={l.lessonId}>
                    <th scope="row">
                      <Link href={`/lessons/${l.code}`}>
                        {l.code} {l.title}
                      </Link>
                    </th>
                    <td className="num">{l.started}</td>
                    <td className="num">
                      {l.finished} ({pct(l.finishRate)})
                    </td>
                    <td className="num">{l.dropOff}</td>
                    <td>{l.mostCommonStop ? `${l.mostCommonStop.screen} (${l.mostCommonStop.learners})` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No lesson has been started yet.</p>
        )}
      </section>
    </main>
  );
}

function QuestionTable({ rows }: { rows: Analytics["questions"] }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Questions">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Question</th>
            <th scope="col" className="num">
              First try
            </th>
            <th scope="col" className="num">
              Learners
            </th>
            <th scope="col">Teaching</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.questionId}>
              <th scope="row">
                <span className="admin-qid">{q.questionId}</span> {q.stem}
              </th>
              <td className="num">{pct(q.firstTryRate)}</td>
              <td className="num">{q.learners}</td>
              <td>
                {q.teach ? (
                  <Link href={q.teach.href}>{q.teach.title}</Link>
                ) : (
                  <Link href={`/lessons/${q.lessonCode}`}>Lesson {q.lessonCode}</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
