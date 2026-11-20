import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Crawl the course; skip the API, admin and per-learner pages. (Per-learner pages also carry
 * noindex, which is what keeps them out of results; this just saves crawl budget.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/dev", "/profile", "/live/", "/sign-in/confirm", "/offline"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
