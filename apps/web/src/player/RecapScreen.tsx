"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Feedback, MasteryRing } from "@hampath/ui";
import { ApiError, api, ensureSession } from "@/lib/api";
import type { Lesson, LessonSummary } from "@/lib/types";
import { ScreenTitle } from "./screens";

/** Recap: the lesson's exam facts as a checklist, the mastery ring, and what's next. */
export function RecapScreen({ lesson, onJumpToQuestion }: { lesson: Lesson; onJumpToQuestion: (qid: string) => void }) {
  const [summary, setSummary] = useState<LessonSummary | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await ensureSession();
        await api("PUT", `/lessons/${lesson.code}/progress`, { complete: true, step: lesson.cards.length + lesson.questions.length });
        setSummary(await api<LessonSummary>("GET", `/lessons/${lesson.code}/summary`));
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setMissing((e.details as { missing: string[] }).missing);
        else setError(e instanceof Error ? e.message : "Something went wrong");
      }
    })();
  }, [lesson]);

  const facts = lesson.cards.filter((c) => c.examFact).map((c) => c.examFact!);

  if (missing) {
    return (
      <div className="screen screen-narrow">
        <ScreenTitle kicker="Recap">Almost there</ScreenTitle>
        <p className="page-lead">Answer every Check question to finish the lesson. Still to do:</p>
        <ul className="facts">
          {missing.map((id) => (
            <li key={id} className="fact"><button type="button" className="btn-link" onClick={() => onJumpToQuestion(id)}>Question {Number(id.slice(-3))}</button></li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="screen">
      <ScreenTitle kicker="Recap">{`${lesson.title}: done`}</ScreenTitle>
      {error && <Feedback tone="bad" title="Couldn't save your result"><p>{error}</p></Feedback>}
      <div className="recap">
        <div className="ring">
          {summary ? (
            <>
              <MasteryRing total={summary.total} mastered={summary.mastered} learning={summary.firstTryCorrect - Math.min(summary.mastered, summary.firstTryCorrect)} caption="right first try" />
              <ul className="legend">
                <li><span className="legend-swatch" data-k="learning" />Right first try: {summary.firstTryCorrect}</li>
                <li><span className="legend-swatch" data-k="mastered" />Mastered: {summary.mastered}</li>
                <li><span className="legend-swatch" data-k="review" />In your review queue: {summary.inReview}</li>
              </ul>
              <p className="field-help">A question is mastered after you get it right again on a later day, in review.</p>
            </>
          ) : (
            <div className="skeleton" style={{ width: 200, height: 200, borderRadius: "50%" }} aria-label="Loading your results" />
          )}
        </div>
        <div className="screen-text">
          <h2 className="section-title">What you can now answer</h2>
          <ul className="facts">
            {facts.map((f) => (
              <li key={f} className="fact">
                <svg className="fact-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="actions">
            {lesson.next?.authored ? (
              <Link className="btn btn-primary" href={`/lessons/${lesson.next.code}`}>Next: {lesson.next.code} {lesson.next.title}</Link>
            ) : (
              <Link className="btn btn-primary" href="/">Back to the course map</Link>
            )}
            {lesson.next && !lesson.next.authored && <p className="field-help" style={{ alignSelf: "center" }}>Next up, {lesson.next.code} {lesson.next.title}, is being written.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
