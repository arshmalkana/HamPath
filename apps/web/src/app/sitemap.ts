import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

// Built per request from the API, so it always lists the lessons that are loaded.
export const dynamic = "force-dynamic";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/placement"), changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/mocks"), changeFrequency: "monthly", priority: 0.7 },
  ];
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/sections`, { cache: "no-store" });
    const sections = (await res.json()) as { lessons: { code: string }[] }[];
    for (const s of sections)
      for (const l of s.lessons)
        pages.push({ url: absoluteUrl(`/lessons/${l.code}`), changeFrequency: "monthly", priority: 0.8 });
  } catch {
    // API unreachable: still serve the top-level pages.
  }
  return pages;
}
