import Link from "next/link";
import type { QuizKind } from "./QuizPage";
import type { QuizResults } from "./types";

/** Results for a checkpoint, mock, placement or test-out: score, status, breakdown, weak lessons, every miss. */
export function ResultsView({ r, kind }: { r: QuizResults; kind: QuizKind }) {
  const tested = r.testedOut ?? 0;
  const status =
    kind === "placement"
      ? "Placement done"
      : kind === "testout"
        ? tested
          ? `${tested} lesson${tested === 1 ? "" : "s"} tested out`
          : "No lessons tested out yet"
        : kind === "mock"
          ? r.honours
            ? "Pass with honours"
            : r.passed
              ? "Pass"
              : "Not a pass yet"
          : r.passed
            ? "Checkpoint passed"
            : "Not passed yet";
  const note =
    kind === "placement"
      ? r.recommendTestOut?.length
        ? "You got every question right in the sections below, so you can test out of their lessons."
        : "No section was all right this time. Work through the lessons in the recommended order; your misses are listed below."
      : kind === "testout"
        ? "A lesson is tested out when every question asked from it is right. Tested-out lessons count as finished, and their questions still come up in Daily Review."
        : kind === "mock"
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
          {kind === "mock"
            ? "Mock exam results"
            : kind === "placement"
              ? "Placement test"
              : kind === "testout"
                ? `Test-out${r.title ? `: ${r.title}` : ""}`
                : `Section Checkpoint${r.title ? `: ${r.title}` : ""}`}
        </p>
        <h1 className="page-title">{status}</h1>
        <p className="page-lead">{note}</p>
      </div>

      <div className="results-top">
        <div className="score" data-tone={kind === "placement" ? "neutral" : r.passed ? "good" : "bad"}>
          <span className="score-num">{r.score}%</span>
          <span className="score-sub">
            {r.correct} of {r.total} correct
          </span>
        </div>
        {r.sectionBreakdown && (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Score by section">
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
          </div>
        )}
      </div>

      {r.recommendTestOut && r.recommendTestOut.length > 0 && (
        <section className="map-section" aria-labelledby="testout">
          <h2 className="section-title" id="testout">
            Test out of these sections
          </h2>
          <ul className="chip-row">
            {r.recommendTestOut.map((s) => (
              <li key={s.number}>
                <Link className="btn btn-quiet" href={`/test-out/new?section=${s.number}`}>
                  {s.number}. {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.lessons && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Result by lesson">
          <table className="table">
            <caption className="visually-hidden">Result by lesson</caption>
            <thead>
              <tr>
                <th scope="col">Lesson</th>
                <th scope="col" className="num">
                  Correct
                </th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {r.lessons.map((l) => (
                <tr key={l.lessonId}>
                  <th scope="row">
                    {l.code} {l.title}
                  </th>
                  <td className="num">
                    {l.correct}/{l.total}
                  </td>
                  <td>{l.testedOut ? "Tested out" : "Take the lesson"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
