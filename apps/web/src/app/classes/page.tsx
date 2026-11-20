import type { Metadata } from "next";
import Link from "next/link";
import { serverApi } from "@/lib/server";
import { CreateClass, JoinClass } from "./forms";

export const metadata: Metadata = { title: "Classes", robots: { index: false, follow: true } };

interface Classes {
  canTeach: boolean;
  teaching: { id: string; name: string; joinCode: string; members: number }[];
  joined: { id: string; name: string; instructor: string | null; liveQuizId: string | null }[];
}

export default async function ClassesPage() {
  const res = await serverApi<Classes>("/classes");
  const data: Classes = res.ok ? res.data : { canTeach: false, teaching: [], joined: [] };
  return (
    <main className="container page" id="main">
      <div className="page-head">
        <h1 className="page-title">Classes</h1>
        <p className="page-lead">
          Learning with a club or an instructor? Join their class with the code they give you. They’ll see your progress
          and can run live quizzes you answer from your phone.
        </p>
      </div>

      {data.joined.length > 0 && (
        <section className="map-section" aria-labelledby="joined">
          <h2 className="section-title" id="joined">
            Your classes
          </h2>
          <ul className="lesson-grid">
            {data.joined.map((c) => (
              <li key={c.id}>
                <Link
                  className="lesson-tile"
                  href={c.liveQuizId ? `/live/${c.liveQuizId}` : `/classes/${c.id}`}
                  data-authored="true"
                >
                  <span className="lesson-tile-title">{c.name}</span>
                  <span className="lesson-tile-state">
                    {c.liveQuizId
                      ? "Live quiz running: join now"
                      : c.instructor
                        ? `With ${c.instructor}`
                        : "Open the class"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="map-section" aria-labelledby="join">
        <h2 className="section-title" id="join">
          Join a class
        </h2>
        <JoinClass />
      </section>

      {data.canTeach && (
        <section className="map-section" aria-labelledby="teaching">
          <h2 className="section-title" id="teaching">
            Classes you teach
          </h2>
          {data.teaching.length > 0 && (
            <ul className="lesson-grid">
              {data.teaching.map((c) => (
                <li key={c.id}>
                  <Link className="lesson-tile" href={`/classes/${c.id}`} data-authored="true">
                    <span className="lesson-tile-code">{c.joinCode}</span>
                    <span className="lesson-tile-title">{c.name}</span>
                    <span className="lesson-tile-state">
                      {c.members} learner{c.members === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <CreateClass />
        </section>
      )}
    </main>
  );
}
