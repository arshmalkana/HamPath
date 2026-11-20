import type { Metadata } from "next";
import { serverApi } from "@/lib/server";
import type { Section } from "@/lib/types";
import { StartQuiz } from "@/quiz/StartQuiz";

export const metadata: Metadata = { title: "Test out", robots: { index: false, follow: true } };

export default async function NewTestOutPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section = "" } = await searchParams;
  const res = await serverApi<Section>(`/sections/${encodeURIComponent(section)}`);
  if (!res.ok) {
    return (
      <main className="container page" id="main">
        <div className="notice" role="alert">
          <h2>No such section</h2>
          <p>{res.error}</p>
        </div>
      </main>
    );
  }
  const s = res.data;
  const questions = s.lessons.reduce((n, l) => n + Math.min(3, l.questionCount), 0);
  return (
    <main className="container page" id="main">
      <div className="page-head">
        <p className="screen-kicker">Section {s.number} test-out</p>
        <h1 className="page-title">{s.title}</h1>
        <p className="page-lead">
          Three questions from each of its {s.lessons.length} lessons ({questions} in all). Get every question for a
          lesson right and it is marked tested out, so you can skip it. Its questions still come up in your Daily
          Review.
        </p>
      </div>
      <StartQuiz
        create={`/test-out/${s.number}`}
        goTo="/test-out"
        label="Start the test-out"
        busyLabel="Drawing your questions…"
      />
    </main>
  );
}
