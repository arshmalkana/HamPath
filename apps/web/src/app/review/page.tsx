import type { Metadata } from "next";
import { ReviewSession } from "./ReviewSession";

export const metadata: Metadata = { title: "Daily Review", robots: { index: false, follow: true } };

export default function ReviewPage() {
  return <ReviewSession />;
}
