import type { Metadata } from "next";
import { LiveQuiz } from "./LiveQuiz";

export const metadata: Metadata = { title: "Live quiz", robots: { index: false, follow: true } };

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveQuiz id={id} />;
}
