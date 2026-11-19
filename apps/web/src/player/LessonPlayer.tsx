"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, PhaseProgress, type Phase } from "@hampath/ui";
import { cacheForOffline } from "@/components/OfflineSupport";
import { preloadLabs } from "@/labs/registry";
import { api, ensureSession, track } from "@/lib/api";
import { newId } from "@/lib/id";
import { enqueue, isOffline } from "@/lib/outbox";
import type { Card, Lesson, Question } from "@/lib/types";
import { QuestionScreen, emptyQuestionState, type QuestionState } from "./QuestionScreen";
import { RecapScreen } from "./RecapScreen";
import { SCREENS } from "./screens";

type PhaseName = "Hook" | "Explore" | "Learn" | "Check" | "Recap";
type Screen =
  | { kind: "card"; card: Card; phase: PhaseName }
  | { kind: "question"; q: Question; n: number; phase: "Check" }
  | { kind: "recap"; phase: "Recap" };

const PHASES: PhaseName[] = ["Hook", "Explore", "Learn", "Check", "Recap"];

/** SPEC §3 order: Hook → Explore (lab) → Learn cards → Check (every question) → Recap. */
function buildScreens(lesson: Lesson): Screen[] {
  const firstLearn = lesson.cards.findIndex((c) => c.type !== "hook" && c.type !== "lab" && c.type !== "intro");
  const cards: Screen[] = lesson.cards.map((card, i) => ({
    kind: "card",
    card,
    phase:
      card.type === "hook" || card.type === "intro"
        ? "Hook"
        : card.type === "lab" && (firstLearn === -1 || i < firstLearn)
          ? "Explore"
          : "Learn",
  }));
  const qs: Screen[] = lesson.questions.map((q, i) => ({ kind: "question", q, n: i + 1, phase: "Check" }));
  return [...cards, ...qs, { kind: "recap", phase: "Recap" }];
}

export function LessonPlayer({ lesson, initialCardId }: { lesson: Lesson; initialCardId?: string }) {
  const screens = useMemo(() => buildScreens(lesson), [lesson]);
  const firstCheck = screens.findIndex((s) => s.kind === "question");
  const startAt = () => {
    const deep = initialCardId ? screens.findIndex((s) => s.kind === "card" && s.card.id === initialCardId) : -1;
    if (deep >= 0) return deep;
    const p = lesson.progress;
    if (p && !p.completedAt) return Math.min(p.step, firstCheck === -1 ? screens.length - 1 : firstCheck);
    return 0;
  };
  const [index, setIndex] = useState(startAt);
  const [done, setDone] = useState<Set<number>>(() => new Set(Array.from({ length: startAt() }, (_, i) => i)));
  const [answers, setAnswers] = useState<Record<string, QuestionState>>({});
  const [returnTo, setReturnTo] = useState<number | null>(null);
  const [memory, setMemory] = useState<Record<string, string>>({});

  useEffect(() => {
    void ensureSession().catch(() => undefined);
    // Keep this lesson's whole section available offline (SPEC §6).
    api<{ lessons: { code: string; labId: string | null }[] }>("GET", `/sections/${lesson.section.id}`)
      .then((s) => {
        cacheForOffline(s.lessons.map((l) => `/lessons/${l.code}`));
        // After the page settles, fetch the section's lab code so the labs work offline too.
        setTimeout(() => preloadLabs(s.lessons.map((l) => l.labId)), 3000);
      })
      .catch(() => undefined);
  }, [lesson.section.id]);

  const screen = screens[index]!;
  const markDone = useCallback((i: number) => setDone((d) => (d.has(i) ? d : new Set(d).add(i))), []);

  // Offline, the service worker serves this lesson's cached page whatever the ?card= in the address,
  // so the server-side deep link is missing; honour the address bar once hydrated.
  useEffect(() => {
    if (initialCardId) return;
    const card = new URLSearchParams(window.location.search).get("card");
    const deep = card ? screens.findIndex((s) => s.kind === "card" && s.card.id === card) : -1;
    if (deep <= 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync with the URL after hydration
    setIndex(deep);
    setDone((d) => new Set([...d, ...Array.from({ length: deep }, (_, i) => i)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (to: number) => {
    const target = Math.max(0, Math.min(screens.length - 1, to));
    if (target > index) {
      void api("PUT", `/lessons/${lesson.code}/progress`, { step: target }).catch((e) => {
        if (isOffline(e)) enqueue("PUT", `/lessons/${lesson.code}/progress`, { step: target });
      });
    }
    setIndex(target);
    window.scrollTo({ top: 0 });
  };

  const phases: Phase[] = PHASES.map((name) => {
    const idx = screens.map((s, i) => (s.phase === name ? i : -1)).filter((i) => i >= 0);
    const complete = idx.filter((i) => done.has(i) || i < index).length;
    return { label: name, fill: idx.length ? complete / idx.length : 1, current: screen.phase === name };
  }).filter((p) => screens.some((s) => s.phase === p.label));

  const canContinue = done.has(index) || screen.kind === "recap";
  // Labs are optional: an unfinished lab can be skipped (recorded, so hard labs show up in analytics).
  const skippableLab = screen.kind === "card" && screen.card.type === "lab" && !canContinue ? screen.card : null;
  const skipLab = () => {
    if (!skippableLab) return;
    if (skippableLab.labStep)
      track("/lab-events", { lab_step_id: skippableLab.labStep.id, event: "skipped", payload: {}, client_id: newId() });
    markDone(index);
    go(index + 1);
  };
  const status =
    screen.kind === "card" && !canContinue
      ? screen.card.type === "lab"
        ? "Reach the goal to continue, or skip the lab"
        : "Answer to continue"
      : screen.kind === "question" && !canContinue
        ? "Answer to continue"
        : "";

  let body: React.ReactNode;
  if (screen.kind === "card") {
    const S = SCREENS[screen.card.type];
    body = (
      <S
        key={screen.card.id}
        card={screen.card}
        done={done.has(index)}
        onDone={() => markDone(index)}
        memory={memory}
        remember={(k, v) => setMemory((m) => ({ ...m, [k]: v }))}
        labSteps={lesson.labSteps}
      />
    );
  } else if (screen.kind === "question") {
    const qi = index;
    body = (
      <QuestionScreen
        key={screen.q.id}
        q={screen.q}
        number={screen.n}
        total={lesson.questions.length}
        state={answers[screen.q.id] ?? emptyQuestionState}
        setState={(s) => setAnswers((a) => ({ ...a, [screen.q.id]: s }))}
        onDone={() => markDone(qi)}
        onSeeAgain={(cardId) => {
          setReturnTo(qi);
          go(screens.findIndex((s) => s.kind === "card" && s.card.id === cardId));
        }}
      />
    );
  } else {
    body = (
      <RecapScreen
        lesson={lesson}
        onJumpToQuestion={(qid) => go(screens.findIndex((s) => s.kind === "question" && s.q.id === qid))}
      />
    );
  }

  return (
    <div className="player">
      <header className="player-head">
        <div className="container player-head-inner">
          <div className="player-title-row">
            <p className="player-title">
              <span className="player-title-code">{lesson.code}</span>
              {lesson.title}
            </p>
            <span className="player-count">
              Screen {index + 1} of {screens.length}
            </span>
          </div>
          <PhaseProgress phases={phases} label="Lesson progress" />
        </div>
      </header>
      <main className="player-body" id="main">
        <div className="container">{body}</div>
      </main>
      <footer className="player-foot">
        <div className="container player-foot-inner">
          {index > 0 ? (
            <Button variant="quiet" onClick={() => go(index - 1)}>
              Back
            </Button>
          ) : (
            <Link className="btn btn-quiet" href="/">
              Course map
            </Link>
          )}
          <span className="player-foot-status" aria-live="polite">
            {status}
          </span>
          {returnTo !== null && screen.kind === "card" ? (
            <Button
              onClick={() => {
                const r = returnTo;
                setReturnTo(null);
                go(r);
              }}
            >
              Back to question
            </Button>
          ) : screen.kind !== "recap" ? (
            <>
              {skippableLab && (
                <Button variant="quiet" className="player-skip" onClick={skipLab}>
                  Skip this lab
                </Button>
              )}
              <Button onClick={() => go(index + 1)} disabled={!canContinue}>
                {index + 1 === firstCheck
                  ? "Start the Check"
                  : screens[index + 1]?.kind === "recap"
                    ? "Finish"
                    : "Continue"}
              </Button>
            </>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
