import { OG_SIZE, shareCard } from "@/lib/og";

export const alt = "A HamPath lesson for Canada's Basic amateur radio exam";
export const size = OG_SIZE;
export const contentType = "image/png";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const lesson = await fetch(`${API_ORIGIN}/api/v1/lessons/${encodeURIComponent(code)}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!lesson) {
    return shareCard({ kicker: "Canada's Basic amateur radio exam", title: "HamPath lesson", stats: [] });
  }
  return shareCard({
    kicker: `Lesson ${lesson.code}, ${lesson.section.title}`,
    title: lesson.title,
    stats: [
      [String(lesson.questions.length), "ISED questions"],
      ...(lesson.lab ? ([["Lab", lesson.lab.name]] as [string, string][]) : []),
      [`${lesson.estMinutes ?? 10} min`, "to learn"],
    ],
  });
}
