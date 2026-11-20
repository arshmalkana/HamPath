import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonPlayer } from "@/player/LessonPlayer";
import { serverApi } from "@/lib/server";
import type { Lesson } from "@/lib/types";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL, absoluteUrl } from "@/lib/site";

/** One line for search results, from the lesson's own facts (about 155 characters). */
function describe(l: Lesson) {
  const n = l.questions.length;
  const lab = l.lab ? ` with the hands-on ${l.lab.name} lab` : "";
  return `${l.title}: learn the ${n} ISED question${n === 1 ? "" : "s"} on this topic (${l.id}) for Canada's Basic amateur radio exam${lab}. Free.`;
}

function lessonJsonLd(l: Lesson) {
  const url = absoluteUrl(`/lessons/${l.code}`);
  return [
    {
      "@context": "https://schema.org",
      "@type": "LearningResource",
      name: `${l.code} ${l.title}`,
      description: describe(l),
      url,
      inLanguage: "en-CA",
      isAccessibleForFree: true,
      learningResourceType: "Lesson",
      educationalLevel: "Beginner",
      timeRequired: l.estMinutes ? `PT${l.estMinutes}M` : undefined,
      about: l.section.title,
      isPartOf: { "@id": `${SITE_URL}/#course` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "HamPath", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: `${l.section.number}. ${l.section.title}`, item: absoluteUrl("/") },
        { "@type": "ListItem", position: 3, name: `${l.code} ${l.title}`, item: url },
      ],
    },
  ];
}

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ card?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const res = await serverApi<Lesson>(`/lessons/${encodeURIComponent(code)}`);
  if (!res.ok) return { title: "Lesson", robots: { index: false } };
  const l = res.data;
  const title = `${l.code} ${l.title}: Canadian ham radio Basic exam`;
  const description = describe(l);
  const path = `/lessons/${l.code}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "article", url: path, title, description },
    twitter: { card: "summary_large_image", title, description },
  };
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
  return (
    <>
      <JsonLd data={lessonJsonLd(lesson)} />
      <LessonPlayer lesson={lesson} initialCardId={card} />
    </>
  );
}
