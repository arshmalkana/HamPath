import Link from "next/link";
import type { QuizResults } from "./types";

/** Results for a Section Checkpoint or a mock exam: score, status, breakdown, weak lessons, every miss. */
export function ResultsView({ r, kind }: { r: QuizResults; kind: "checkpoint" | "mock" }) {
  const status =
    kind === "mock"
      ? r.honours
        ? "Pass with honours"
        : r.passed
          ? "Pass"
          : "Not a pass yet"
      : r.passed
        ? "Checkpoint passed"
        : "Not passed yet";
  const note =
    kind === "mock"
      ? r.honours
        ? `${r.honoursPercent}% or more: honours, which opens the bands below 30 MHz.`
        : r.passed
          ? `Pass mark is ${r.passPercent}%. Honours (bands below 30 MHz) needs ${r.honoursPercent}%.`
          : `Pass mark is ${r.passPercent}%.`
      : r.passed
        ? `${r.passPercent}% or more earns the section badge.${r.badge ? " Badge earned." : ""}`
        : `${r.passPercent}% earns the section badge. Your misses are listed below with links back to the lessons.`;

  return (
    <main className="container page" id="main">
      <div className="page-head">
        <p className="screen-kicker">
          {kind === "mock" ? "Mock exam results" : `Section Checkpoint${r.title ? `: ${r.title}` : ""}`}
        </p>
        <h1 className="page-title">{status}</h1>
        <p className="page-lead">{note}</p>
      </div>

      <div className="results-top">
        <div className="score" data-tone={r.passed ? "good" : "bad"}>
          <span className="score-num">{r.score}%</span>
          <span className="score-sub">
            {r.correct} of {r.total} correct
          </span>
        </div>
        {r.sectionBreakdown && (
          <table className="table">
            <caption className="visually-hidden">Score by section</caption>
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col" className="num">
                  Correct
                </th>
                <th scope="col" className="num">
                  Score
                </th>
              </tr>
            </thead>
            <tbody>
              {r.sectionBreakdown.map((s) => (
                <tr key={s.sectionId}>
                  <th scope="row">
                    {s.number}. {s.title}
                  </th>
                  <td className="num">
                    {s.correct}/{s.total}
                  </td>
                  <td className="num">{Math.round((100 * s.correct) / s.total)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {r.weakLessons.length > 0 && (
        <section className="map-section" aria-labelledby="weak">
          <h2 className="section-title" id="weak">
            Weak lessons
          </h2>
          <ul className="lesson-grid">
            {r.weakLessons.map((w) => (
              <li key={w.lessonId}>
                <Link className="lesson-tile" href={w.href} data-authored="true">
                  <span className="lesson-tile-code">{w.code}</span>
                  <span className="lesson-tile-title">{w.title}</span>
                  <span className="lesson-tile-state">
                    Missed {w.missed} of {w.total}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="map-section" aria-labelledby="misses">
        <h2 className="section-title" id="misses">
          {r.misses.length ? `Review your ${r.misses.length} miss${r.misses.length === 1 ? "" : "es"}` : "No misses"}
        </h2>
        <ol className="misses">
          {r.misses.map((m) => (
            <li key={m.questionId} className="miss">
              <p className="miss-stem">{m.stem}</p>
              <p>
                <span className="miss-label">Your answer</span> {m.chosen ? m.chosen.text : "No answer"}
              </p>
              <p>
                <span className="miss-label">Correct</span> <strong>{m.correctOption.text}</strong>
              </p>
              {m.whyNot && (
                <p className="miss-why">
                  <strong>Why not?</strong> {m.whyNot}
                </p>
              )}
              {m.workedSolution && (
                <ol className="steps" aria-label="Worked solution">
                  {m.workedSolution.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
              {m.teach && (
                <Link className="btn-link" href={m.teach.href}>
                  See it again: {m.teach.title}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="actions">
        <Link className="btn btn-primary" href="/">
          Back to the dashboard
        </Link>
        {kind === "mock" && (
          <Link className="btn btn-quiet" href="/mocks">
            Mock exams
          </Link>
        )}
      </div>
    </main>
  );
}
