import type { Metadata } from "next";
import { QuizPage } from "@/quiz/QuizPage";

export const metadata: Metadata = { title: "Placement test" };

export default async function PlacementRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuizPage kind="placement" id={id} />;
}
