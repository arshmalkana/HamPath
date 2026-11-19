import type { Metadata } from "next";
import Link from "next/link";
import { serverApi } from "@/lib/server";
import type { Section } from "@/lib/types";
import { AssignSection, RemoveAssignment, StartLive } from "./controls";

export const metadata: Metadata = { title: "Class" };

interface Assignment {
  sectionId: string;
  number: number;
  title: string;
  dueOn: string | null;
}
interface ClassInfo {
  id: string;
  name: string;
  isInstructor: boolean;
  joinCode?: string;
  assignments: Assignment[];
  liveQuiz: { id: string; state: string } | null;
}
interface Topic {
  lessonId: string;
  code: string;
  title: string;
  accuracy: number;
  learners?: number;
}
interface Dashboard {
  learners: {
    userId: string;
    name: string;
    lastActive: string | null;
    lessonsCompleted: number;
    masteryPercent: number;
    assignedProgress: number | null;
    weakTopics: Topic[];
  }[];
  weakTopics: Topic[];
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }) : "Not yet";

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await serverApi<ClassInfo>(`/classes/${encodeURIComponent(id)}`);
  if (!res.ok) {
    return (
      <main className="container page" id="main">
        <div className="notice" role="alert">
          <h2>{res.status === 403 ? "Join the class first" : "No such class"}</h2>
          <p>
            {res.status === 403 ? "Ask your instructor for the class code, then join on the " : `${res.error} `}
            <Link href="/classes">Classes page</Link>.
          </p>
        </div>
      </main>
    );
  }
  const c = res.data;
  if (!c.isInstructor) return <LearnerView c={c} />;

  const [dash, sections] = await Promise.all([
    serverApi<Dashboard>(`/classes/${c.id}/dashboard`),
    serverApi<Section[]>("/sections"),
  ]);
  const d = dash.ok ? dash.data : { learners: [], weakTopics: [] };
  const options = sections.ok ? sections.data.map((s) => ({ number: s.number, title: s.title })) : [];

  return (
    <main className="container page" id="main">
      <div className="page-head">
        <p className="screen-kicker">Your class</p>
        <h1 className="page-title">{c.name}</h1>
        <p className="page-lead">
          Learners join on the Classes page with the code <strong className="join-code">{c.joinCode}</strong>.
        </p>
      </div>

      <section className="map-section" aria-labelledby="live">
        <h2 className="section-title" id="live">
          Live quiz
        </h2>
        {c.liveQuiz ? (
          <Link className="btn btn-primary" href={`/live/${c.liveQuiz.id}`}>
            Back to the running quiz
          </Link>
        ) : (
          <StartLive classId={c.id} sections={options} />
        )}
      </section>

      <section className="map-section" aria-labelledby="assigned">
        <h2 className="section-title" id="assigned">
          Assigned sections
        </h2>
        {c.assignments.length ? (
          <ul className="assignment-list">
            {c.assignments.map((a) => (
              <li key={a.sectionId}>
                <span>
                  {a.number}. {a.title}
                  {a.dueOn && <span className="field-help"> by {day(a.dueOn)}</span>}
                </span>
                <RemoveAssignment classId={c.id} section={a.number} label={`${a.number}. ${a.title}`} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-help">Nothing assigned yet. Learners see assigned sections on their class page.</p>
        )}
        <AssignSection classId={c.id} sections={options} />
      </section>

      <section className="map-section" aria-labelledby="learners">
        <h2 className="section-title" id="learners">
          Learners
        </h2>
        {d.learners.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="learners">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Learner</th>
                  <th scope="col">Last active</th>
                  <th scope="col" className="num">
                    Lessons done
                  </th>
                  <th scope="col" className="num">
                    Mastered
                  </th>
                  <th scope="col" className="num">
                    Assigned done
                  </th>
                  <th scope="col">Weak topics</th>
                </tr>
              </thead>
              <tbody>
                {d.learners.map((l) => (
                  <tr key={l.userId}>
                    <th scope="row">{l.name}</th>
                    <td>{day(l.lastActive)}</td>
                    <td className="num">{l.lessonsCompleted}</td>
                    <td className="num">{l.masteryPercent}%</td>
                    <td className="num">{l.assignedProgress === null ? "–" : `${l.assignedProgress}%`}</td>
                    <td>
                      {l.weakTopics.length
                        ? l.weakTopics.map((t, i) => (
                            <span key={t.lessonId}>
                              {i > 0 && ", "}
                              <Link href={`/lessons/${t.code}`}>
                                {t.code} {t.title}
                              </Link>{" "}
                              ({t.accuracy}%)
                            </span>
                          ))
                        : "None"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No one has joined yet. Share the code {c.joinCode}.</p>
        )}
      </section>

      {d.weakTopics.length > 0 && (
        <section className="map-section" aria-labelledby="classweak">
          <h2 className="section-title" id="classweak">
            Where the class struggles
          </h2>
          <p className="field-help">
            Lessons with first-try accuracy under 70% across the class: good topics for the next session.
          </p>
          <ul className="lesson-grid">
            {d.weakTopics.map((t) => (
              <li key={t.lessonId}>
                <Link className="lesson-tile" href={`/lessons/${t.code}`} data-authored="true">
                  <span className="lesson-tile-code">{t.code}</span>
                  <span className="lesson-tile-title">{t.title}</span>
                  <span className="lesson-tile-state">
                    {t.accuracy}% first try, {t.learners} learner{t.learners === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function LearnerView({ c }: { c: ClassInfo }) {
  return (
    <main className="container page" id="main">
      <div className="page-head">
        <p className="screen-kicker">Your class</p>
        <h1 className="page-title">{c.name}</h1>
      </div>
      {c.liveQuiz && (
        <section className="map-section" aria-labelledby="live">
          <h2 className="section-title" id="live">
            A live quiz is running
          </h2>
          <Link className="btn btn-primary" href={`/live/${c.liveQuiz.id}`}>
            Join the live quiz
          </Link>
        </section>
      )}
      <section className="map-section" aria-labelledby="assigned">
        <h2 className="section-title" id="assigned">
          Assigned to you
        </h2>
        {c.assignments.length ? (
          <ul className="lesson-grid">
            {c.assignments.map((a) => (
              <li key={a.sectionId}>
                <Link className="lesson-tile" href={`/#sec-${a.sectionId}`} data-authored="true">
                  <span className="lesson-tile-code">Section {a.number}</span>
                  <span className="lesson-tile-title">{a.title}</span>
                  <span className="lesson-tile-state">{a.dueOn ? `By ${day(a.dueOn)}` : "No date set"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing assigned yet.</p>
        )}
      </section>
    </main>
  );
}
