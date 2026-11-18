import type { Metadata } from "next";
import { QuizPage } from "@/quiz/QuizPage";

export const metadata: Metadata = { title: "Mock exam" };

export default async function MockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuizPage kind="mock" id={id} />;
}
