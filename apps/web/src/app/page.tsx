import Link from "next/link";
import { ShackScene } from "@hampath/ui";
import { serverApi } from "@/lib/server";
import type { Section } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Dashboard {
  readiness: {
    masteryPercent: number;
    mastered: number;
    totalQuestions: number;
    mocksTaken: number;
    mockAverage: number | null;
    readiness: number | null;
    green: boolean;
    mocksNeeded: number;
  };
  streak: { days: number; activeToday: boolean };
  reviewDueToday: number;
  lastMocks: { id: string; score: number; passed: boolean; honours: boolean; finishedAt: string }[];
  sections: {
    id: string;
    number: number;
    masteryPercent: number;
    mastered: number;
    totalQuestions: number;
    lessonsCompleted: number;
    lessons: number;
    badge: boolean;
  }[];
}

const SHORT: Record<number, string> = {
  1: "Regulations",
  2: "Operating",
  3: "Station",
  4: "Components",
  5: "Electronics",
  6: "Antennas",
  7: "Propagation",
  8: "Interference",
};

function ReadinessRing({ value, green }: { value: number | null; green: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = value === null ? 0 : (value / 100) * c;
  return (
    <svg
      viewBox="0 0 128 128"
      width="112"
      height="112"
      role="img"
      aria-label={value === null ? "Readiness not available yet" : `Readiness ${value}%${green ? ", ready" : ""}`}
    >
      <circle cx="64" cy="64" r={r} className="ring-track" strokeWidth="12" />
      <circle
        cx="64"
        cy="64"
        r={r}
        className={green ? "ring-seg-mastered" : "ring-seg-learning"}
        strokeWidth="12"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 64 64)"
      />
      <text x="64" y="72" textAnchor="middle" className="ring-num" style={{ fontSize: 24 }}>
        {value === null ? "—" : `${Math.round(value)}%`}
      </text>
    </svg>
  );
}

export default async function DashboardPage() {
  const [secRes, dashRes] = await Promise.all([
    serverApi<Section[]>("/sections"),
    serverApi<Dashboard>("/me/dashboard"),
  ]);
  if (!secRes.ok) {
    return (
      <main className="container page" id="main">
        <div className="notice" role="alert">
          <h2>The course didn’t load</h2>
          <p>{secRes.error}</p>
          <p>
            Start everything with <code className="code">pnpm dev</code>, then reload.
          </p>
        </div>
      </main>
    );
  }
  const sections = [...secRes.data].sort((a, b) => a.recommendedOrder - b.recommendedOrder);
  const all = sections.flatMap((s) => s.lessons);
  if (!all.length) {
    return (
      <main className="container page" id="main">
        <div className="notice">
          <h2>No lessons yet</h2>
          <p>
            Run <code className="code">pnpm db:setup</code> to load the course.
          </p>
        </div>
      </main>
    );
  }
  // New visitors have no session yet: show the same dashboard at zero.
  const d: Dashboard = dashRes.ok
    ? dashRes.data
    : {
        readiness: {
          masteryPercent: 0,
          mastered: 0,
          totalQuestions: all.reduce((n, l) => n + l.questionCount, 0),
          mocksTaken: 0,
          mockAverage: null,
          readiness: null,
          green: false,
          mocksNeeded: 3,
        },
        streak: { days: 0, activeToday: false },
        reviewDueToday: 0,
        lastMocks: [],
        sections: sections.map((s) => ({
          id: s.id,
          number: s.number,
          masteryPercent: 0,
          mastered: 0,
          totalQuestions: 0,
          lessonsCompleted: 0,
          lessons: s.lessons.length,
          badge: false,
        })),
      };
  const statOf = (id: string) => d.sections.find((s) => s.id === id);
  const next = all.find((l) => !l.completedAt && l.step) ?? all.find((l) => !l.completedAt);
  const r = d.readiness;

  return (
    <main className="container page" id="main">
      <div className="dash-hero">
        <div className="shack shack-panel dash-scene">
          <ShackScene
            now={new Date()}
            readiness={r.readiness}
            bands={[...sections]
              .sort((a, b) => a.number - b.number)
              .map((s) => ({ label: `${s.number} ${SHORT[s.number]}`, percent: statOf(s.id)?.masteryPercent ?? 0 }))}
          />
        </div>
        <div className="dash-intro">
          <h1 className="page-title">Basic Qualification, all 984 questions</h1>
          <p className="page-lead">
            {r.mastered
              ? `${r.mastered} of ${r.totalQuestions} mastered (${r.masteryPercent}%).`
              : `${sections.length} sections, ${all.length} lessons. Start anywhere; the order below is the recommended one.`}
          </p>
          {next && (
            <Link className="btn btn-primary" href={`/lessons/${next.code}`}>
              {next.step ? "Resume" : "Start"}: {next.code} {next.title}
            </Link>
          )}
          {!r.mastered && !all.some((l) => l.step || l.completedAt) && (
            <p className="page-lead">
              Already know some of it?{" "}
              <Link className="btn-link" href="/placement">
                Take the 10-minute placement test
              </Link>{" "}
              and test out of what you know.
            </p>
          )}
        </div>
      </div>

      <section className="stats" aria-label="Your progress">
        <div className="stat stat-ring">
          <ReadinessRing value={r.readiness} green={r.green} />
          <div>
            <h2 className="stat-title">Readiness</h2>
            <p className="stat-text">
              {r.readiness === null
                ? `Mastered × 0.5 + last 3 mocks × 0.5. Take ${r.mocksNeeded} more mock exam${r.mocksNeeded === 1 ? "" : "s"} to see it.`
                : r.green
                  ? "85% or more: you’re ready to book the exam."
                  : "Aim for 85% before booking the exam."}
            </p>
          </div>
        </div>
        <div className="stat">
          <h2 className="stat-title">Streak</h2>
          <p className="stat-num">
            {d.streak.days} <span className="stat-unit">day{d.streak.days === 1 ? "" : "s"}</span>
          </p>
          <p className="stat-text">
            {d.streak.activeToday
              ? "Done today."
              : d.streak.days
                ? "Answer one question today to keep it."
                : "Answer a question to start one."}
          </p>
        </div>
        <div className="stat">
          <h2 className="stat-title">Today’s review</h2>
          <p className="stat-num">
            {d.reviewDueToday} <span className="stat-unit">question{d.reviewDueToday === 1 ? "" : "s"}</span>
          </p>
          {d.reviewDueToday ? (
            <Link className="btn btn-quiet" href="/review">
              Start review
            </Link>
          ) : (
            <p className="stat-text">Nothing due.</p>
          )}
        </div>
        <div className="stat">
          <h2 className="stat-title">Last mock exams</h2>
          {d.lastMocks.length ? (
            <ul className="mock-list">
              {d.lastMocks.map((m) => (
                <li key={m.id}>
                  <Link href={`/mocks/${m.id}`} className="btn-link">
                    {m.score}%
                  </Link>{" "}
                  <span className="stat-text">{m.honours ? "honours" : m.passed ? "pass" : "below pass"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="stat-text">None yet.</p>
          )}
          <Link className="btn btn-quiet" href="/mocks">
            Mock exams
          </Link>
        </div>
      </section>

      <div className="map">
        {sections.map((s) => {
          const st = statOf(s.id);
          const qs = s.lessons.reduce((n, l) => n + l.questionCount, 0);
          const pct = st?.masteryPercent ?? 0;
          return (
            <section key={s.id} className="map-section" aria-labelledby={`sec-${s.id}`}>
              <div className="map-section-head">
                <h2 className="map-section-title" id={`sec-${s.id}`}>
                  {s.number}. {s.title}
                  {st?.badge && <span className="badge">Badge earned</span>}
                </h2>
                <span className="map-section-meta">
                  {st?.lessonsCompleted ?? 0} of {s.lessons.length} lessons, {pct}% of {qs} questions mastered.{" "}
                  <Link className="btn-link" href={`/checkpoints/new?section=${s.number}`}>
                    Checkpoint
                  </Link>{" "}
                  <Link className="btn-link" href={`/test-out/new?section=${s.number}`}>
                    Test out
                  </Link>
                </span>
              </div>
              <div
                className="mastery-bar"
                role="progressbar"
                aria-label={`Section ${s.number} mastery`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <span style={{ ["--fill" as string]: pct / 100 }} />
              </div>
              <ul className="lesson-grid">
                {s.lessons.map((l) => (
                  <li key={l.id}>
                    <Link
                      className="lesson-tile"
                      href={`/lessons/${l.code}`}
                      data-authored={l.authored}
                      data-done={Boolean(l.completedAt)}
                    >
                      <span className="lesson-tile-code">{l.code}</span>
                      <span className="lesson-tile-title">{l.title}</span>
                      <span className="lesson-tile-state">
                        {l.testedOut
                          ? "Tested out"
                          : l.completedAt
                            ? "Finished"
                            : l.step
                              ? "In progress"
                              : l.authored
                                ? `Full lesson, ${l.questionCount} questions`
                                : `${l.questionCount} questions`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
