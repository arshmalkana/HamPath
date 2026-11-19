import type { Metadata } from "next";
import Link from "next/link";
import { serverApi } from "@/lib/server";
import { Lab } from "@/labs/Lab";

export const metadata: Metadata = { title: "Mock exams" };
export const dynamic = "force-dynamic";

interface MockList {
  mocks: {
    id: string;
    score: number | null;
    passed: boolean | null;
    honours: boolean | null;
    startedAt: string;
    finishedAt: string | null;
  }[];
  blueprint: { version: string; total: number; timeLimitMinutes: number; passPercent: number; honoursPercent: number };
}

export default async function MocksPage() {
  const res = await serverApi<MockList>("/mocks");
  const bp = res.ok ? res.data.blueprint : null;
  const mocks = res.ok ? res.data.mocks : [];
  return (
    <main className="container page" id="main">
      <div className="page-head">
        <h1 className="page-title">Mock exams</h1>
        <p className="page-lead">
          {bp
            ? `${bp.total} questions drawn across every section, ${bp.timeLimitMinutes} minutes. Pass at ${bp.passPercent}%; ${bp.honoursPercent}% gives honours and the bands below 30 MHz.`
            : "A full exam in the real format, timed."}
        </p>
      </div>
      <Lab id="LAB-35" config={{ config: {}, goal: null }} mode="explore" />
      <section className="map-section" aria-labelledby="past" style={{ marginTop: "var(--space-xl)" }}>
        <h2 className="section-title" id="past">
          Your mock exams
        </h2>
        {mocks.length === 0 ? (
          <p className="field-help">None yet. Your readiness score appears after three.</p>
        ) : (
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="past">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col" className="num">
                    Score
                  </th>
                  <th scope="col">Result</th>
                  <th scope="col">
                    <span className="visually-hidden">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mocks.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {new Date(m.startedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="num">{m.score === null ? "—" : `${m.score}%`}</td>
                    <td>{!m.finishedAt ? "In progress" : m.honours ? "Honours" : m.passed ? "Pass" : "Below pass"}</td>
                    <td>
                      <Link className="btn-link" href={`/mocks/${m.id}`}>
                        {m.finishedAt ? "Results" : "Continue"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {bp && (
        <p className="field-help" style={{ marginTop: "var(--space-lg)" }}>
          Blueprint {bp.version}: section weights to be confirmed against ISED’s current exam specification.
        </p>
      )}
    </main>
  );
}
