import type { Metadata } from "next";
import { QuizPage } from "@/quiz/QuizPage";

export const metadata: Metadata = { title: "Section Checkpoint", robots: { index: false, follow: true } };

export default async function CheckpointPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuizPage kind="checkpoint" id={id} />;
}
