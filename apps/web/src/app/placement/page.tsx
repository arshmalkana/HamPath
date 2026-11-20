import type { Metadata } from "next";
import Link from "next/link";
import { serverApi } from "@/lib/server";
import { StartQuiz } from "@/quiz/StartQuiz";

export const metadata: Metadata = {
  title: "Placement test: skip what you already know",
  description:
    "A 10-minute placement test for Canada's Basic amateur radio exam. Test out of the topics you know and study only the rest.",
  alternates: { canonical: "/placement" },
};

interface Latest {
  latest: {
    id: string;
    score: number;
    sections: { number: number; title: string; correct: number; total: number }[];
    recommendTestOut: number[];
  } | null;
}

export default async function PlacementPage() {
  const res = await serverApi<Latest>("/placement");
  const latest = res.ok ? res.data.latest : null;
  return (
    <main className="container page" id="main">
      <div className="page-head">
        <p className="screen-kicker">Optional, about 10 minutes</p>
        <h1 className="page-title">Placement test</h1>
        <p className="page-lead">
          24 questions, three from each of the 8 sections. You can test out of any section you get all right, and every
          answer also counts toward your review schedule.
        </p>
      </div>
      {latest && (
        <section className="map-section" aria-labelledby="last">
          <h2 className="section-title" id="last">
            Your last placement: {latest.score}%
          </h2>
          {latest.recommendTestOut.length ? (
            <ul className="chip-row">
              {latest.recommendTestOut.map((n) => (
                <li key={n}>
                  <Link className="btn btn-quiet" href={`/test-out/new?section=${n}`}>
                    Test out of section {n}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-help">No section was all right yet, so start with the order on the dashboard.</p>
          )}
        </section>
      )}
      <StartQuiz
        create="/placement"
        goTo="/placement"
        label={latest ? "Take it again" : "Start the placement test"}
        busyLabel="Drawing your questions…"
      />
    </main>
  );
}
