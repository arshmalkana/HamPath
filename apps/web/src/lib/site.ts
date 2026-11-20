/** Public facts about the site, shared by metadata, the sitemap, robots.txt and structured data. */

/** The public origin (APP_ORIGIN in production, e.g. https://hampath.ca), without a trailing slash. */
export const SITE_URL = (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, "");

export const SITE_NAME = "HamPath";

/** About 60 characters: what shows as the result's headline. */
export const SITE_TITLE = "HamPath: Free Canadian Amateur Radio Basic Exam Prep";

/** About 155 characters: what shows under the headline. */
export const SITE_DESCRIPTION =
  "Free course for Canada's Basic amateur radio exam. All 984 ISED questions, 100 short lessons, 35 hands-on labs, mock exams and spaced review.";

export const SITE_KEYWORDS = [
  "Canadian amateur radio exam",
  "ham radio Basic Qualification",
  "ISED amateur radio question bank",
  "amateur radio practice exam Canada",
  "ham radio licence Canada",
  "Basic with Honours",
  "amateur radio course",
  "ham radio study guide",
];

/** Facts used in the Course structured data. Keep them true: no invented ratings or counts. */
export const COURSE_FACTS = {
  questions: 984,
  lessons: 100,
  labs: 35,
  credential:
    "Amateur Radio Operator Certificate with Basic Qualification (Innovation, Science and Economic Development Canada)",
};

export const absoluteUrl = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
