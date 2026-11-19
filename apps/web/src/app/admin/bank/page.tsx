import type { Metadata } from "next";
import Link from "next/link";
import { serverApi } from "@/lib/server";
import { BankUpload, ResolveReview } from "./BankUpload";

export const metadata: Metadata = { title: "Question bank updates" };

interface Versions {
  versions: {
    id: number;
    sourceFile: string;
    importedAt: string;
    questionCount: number;
    added: number;
    changed: number;
    retired: number;
    attempts: number;
  }[];
}
interface Reviews {
  reviews: {
    id: number;
    code: string;
    title: string;
    bankVersion: number;
    questions: { id: string; fields: string[] }[];
    createdAt: string;
    resolvedAt: string | null;
  }[];
}

const FIELD: Record<string, string> = {
  added: "new question",
  stem: "question wording",
  correct_answer: "correct answer",
  distractor_1: "wrong option 1",
  distractor_2: "wrong option 2",
  distractor_3: "wrong option 3",
  restored: "back in the bank",
};
const fields = (fs: string[]) => fs.map((f) => FIELD[f] ?? f).join(", ");
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

/** Step 33: upload a new ISED bank file, see the diff, apply it, and review the lessons it touches. */
export default async function BankPage() {
  const [versions, reviews] = await Promise.all([
    serverApi<Versions>("/admin/bank-versions"),
    serverApi<Reviews>("/admin/card-reviews"),
  ]);
  if (!versions.ok) {
    return (
      <main className="container page" id="main">
        <div className="notice" role="alert">
          <h2>{versions.status === 403 ? "Admins only" : "That didn’t load"}</h2>
          <p>
            {versions.status === 403 ? "Sign in with an admin account to update the question bank." : versions.error}
          </p>
        </div>
      </main>
    );
  }
  const open = reviews.ok ? reviews.data.reviews.filter((r) => !r.resolvedAt) : [];
  const current = versions.data.versions[0];

  return (
    <main className="container page" id="main">
      <div className="page-head">
        <p className="screen-kicker">
          <Link href="/admin">Admin</Link>
        </p>
        <h1 className="page-title">Question bank updates</h1>
        <p className="page-lead">
          {current
            ? `Version ${current.id} is live: ${current.questionCount} questions, imported ${day(current.importedAt)}.`
            : "No bank has been imported yet."}{" "}
          Upload a new ISED file to see exactly what changed before applying it.
        </p>
      </div>

      <section className="map-section" aria-labelledby="upload">
        <h2 className="section-title" id="upload">
          Upload a new bank file
        </h2>
        <BankUpload />
      </section>

      <section className="map-section" aria-labelledby="reviews">
        <h2 className="section-title" id="reviews">
          Lessons to review ({open.length})
        </h2>
        <p className="field-help">
          An import puts a lesson up for review when it adds or changes one of its questions. Check the cards, the Check
          question and the Why not? notes in <code className="code">content/</code>, then mark it reviewed.
        </p>
        {open.length ? (
          <ul className="assignment-list">
            {open.map((r) => (
              <li key={r.id}>
                <span>
                  <Link href={`/lessons/${r.code}`}>
                    {r.code} {r.title}
                  </Link>
                  <span className="field-help">
                    {" "}
                    (version {r.bankVersion}): {r.questions.map((q) => `${q.id}, ${fields(q.fields)}`).join("; ")}
                  </span>
                </span>
                <ResolveReview id={r.id} label={`${r.code} ${r.title}`} />
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing to review.</p>
        )}
      </section>

      <section className="map-section" aria-labelledby="history">
        <h2 className="section-title" id="history">
          Bank versions
        </h2>
        <p className="field-help">
          Past answers stay tied to the wording and version the learner saw: a changed option is retired and replaced,
          never edited.
        </p>
        <div className="table-scroll" tabIndex={0} role="region" aria-labelledby="history">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Imported</th>
                <th scope="col" className="num">
                  Questions
                </th>
                <th scope="col" className="num">
                  Added
                </th>
                <th scope="col" className="num">
                  Changed
                </th>
                <th scope="col" className="num">
                  Removed
                </th>
                <th scope="col" className="num">
                  Answers on it
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.data.versions.map((v) => (
                <tr key={v.id}>
                  <th scope="row">
                    {v.id} <span className="admin-qid">{v.sourceFile}</span>
                  </th>
                  <td>{day(v.importedAt)}</td>
                  <td className="num">{v.questionCount}</td>
                  <td className="num">{v.added}</td>
                  <td className="num">{v.changed}</td>
                  <td className="num">{v.retired}</td>
                  <td className="num">{v.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
