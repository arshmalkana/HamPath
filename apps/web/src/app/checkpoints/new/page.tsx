import type { Metadata } from "next";
import { serverApi } from "@/lib/server";
import type { Section } from "@/lib/types";
import { StartCheckpoint } from "./StartCheckpoint";

export const metadata: Metadata = { title: "Section Checkpoint" };

export default async function NewCheckpointPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
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
  const questions = s.lessons.reduce((n, l) => n + l.questionCount, 0);
  const mastered = s.lessons.reduce((n, l) => n + l.mastered, 0);
  return (
    <main className="container page" id="main">
      <div className="page-head">
        <p className="screen-kicker">Section {s.number} Checkpoint</p>
        <h1 className="page-title">{s.title}</h1>
        <p className="page-lead">
          Every question in this section you haven’t mastered yet ({questions - mastered}), plus a sample of the{" "}
          {mastered} you have. Nothing is marked until you submit. Score 80% to earn the section badge.
        </p>
      </div>
      <StartCheckpoint section={String(s.number)} />
    </main>
  );
}
