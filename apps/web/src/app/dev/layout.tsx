import { notFound } from "next/navigation";

/** The component gallery is a development tool: not served in production unless asked for. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_PAGES !== "1") notFound();
  return children;
}
