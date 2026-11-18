import Link from "next/link";
import { AnalogMeter } from "@hampath/ui";
import { serverApi } from "@/lib/server";
import type { Section } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CourseMap() {
  const res = await serverApi<Section[]>("/sections");
  if (!res.ok) {
    return (
      <main className="container page" id="main">
        <div className="notice" role="alert">
          <h2>The course map didn't load</h2>
          <p>{res.error}</p>
          <p>Start everything with <code className="code">pnpm dev</code>, then reload.</p>
        </div>
      </main>
    );
  }
  const sections = [...res.data].sort((a, b) => a.recommendedOrder - b.recommendedOrder);
  const all = sections.flatMap((s) => s.lessons);
  if (all.length === 0) {
    return (
      <main className="container page" id="main">
        <div className="notice">
          <h2>No lessons yet</h2>
          <p>The database is empty. Run <code className="code">pnpm db:setup</code> to load the sections, lessons and question bank.</p>
        </div>
      </main>
    );
  }
  const featured = all.find((l) => l.authored && !l.completedAt) ?? all.find((l) => l.authored);
  const done = all.filter((l) => l.completedAt).length;

  return (
    <main className="container page" id="main">
      <div className="page-head">
        <h1 className="page-title">Basic Qualification, all 984 questions</h1>
        <p className="page-lead">
          {sections.length} sections, {all.length} lessons. {done ? `${done} finished.` : "Work through them in the recommended order below, or start anywhere."}
        </p>
      </div>

      {featured && (
        <section className="feature" aria-labelledby="feature-title">
          <div>
            <p className="screen-kicker">{featured.completedAt ? "Finished, open any time" : featured.step ? "Pick up where you left off" : "Start here"}</p>
            <h2 className="feature-title" id="feature-title">{featured.code} {featured.title}</h2>
            <p className="feature-text">Build a circuit, turn the knobs, watch the meters, then answer all {featured.questionCount} exam questions on it.</p>
            <Link className="btn btn-primary" href={`/lessons/${featured.code}`}>{featured.step && !featured.completedAt ? "Resume lesson" : "Open lesson"}</Link>
            <p className="feature-meta">About {featured.estMinutes ?? 10} minutes, with the {featured.labId} lab</p>
          </div>
          {featured.labId === "LAB-20" && (
            <div className="shack shack-panel" aria-label="Preview of the Ohm's Law lab">
              <p className="shack-label">6 V across a 30 Ω resistor</p>
              <AnalogMeter label="Ammeter" unit="A" value={0.2} max={0.3} format={(v) => `${Math.round(v * 1000)} mA`} />
            </div>
          )}
        </section>
      )}

      <div className="map">
        {sections.map((s) => {
          const qs = s.lessons.reduce((n, l) => n + l.questionCount, 0);
          return (
            <section key={s.id} className="map-section" aria-labelledby={`sec-${s.id}`}>
              <div className="map-section-head">
                <h2 className="map-section-title" id={`sec-${s.id}`}>{s.number}. {s.title}</h2>
                <span className="map-section-meta">{s.lessons.length} lessons, {qs} questions</span>
              </div>
              <ul className="lesson-grid">
                {s.lessons.map((l) => {
                  const state = l.completedAt ? "Finished" : l.authored ? (l.step ? "In progress" : `${l.questionCount} questions`) : "Being written";
                  const inner = (
                    <>
                      <span className="lesson-tile-code">{l.code}</span>
                      <span className="lesson-tile-title">{l.title}</span>
                      <span className="lesson-tile-state">{state}</span>
                    </>
                  );
                  return (
                    <li key={l.id}>
                      {l.authored ? (
                        <Link className="lesson-tile" href={`/lessons/${l.code}`} data-authored="true" data-done={Boolean(l.completedAt)}>{inner}</Link>
                      ) : (
                        <div className="lesson-tile">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
