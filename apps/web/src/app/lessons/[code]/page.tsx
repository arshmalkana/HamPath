import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPlayer } from "@/player/LessonPlayer";
import { serverApi } from "@/lib/server";
import type { Lesson } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ card?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const res = await serverApi<Lesson>(`/lessons/${encodeURIComponent(code)}`);
  return { title: res.ok ? `${res.data.code} ${res.data.title}` : "Lesson" };
}

export default async function LessonPage({ params, searchParams }: Props) {
  const { code } = await params;
  const { card } = await searchParams;
  const res = await serverApi<Lesson>(`/lessons/${encodeURIComponent(code)}`);
  if (!res.ok && res.status === 404) notFound();
  if (!res.ok) {
    return (
      <main className="container page" id="main">
        <div className="notice" role="alert">
          <h2>The lesson didn’t load</h2>
          <p>{res.error}</p>
        </div>
      </main>
    );
  }
  const lesson = res.data;
  return <LessonPlayer lesson={lesson} initialCardId={card} />;
}
