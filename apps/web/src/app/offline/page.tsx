import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Offline", robots: { index: false, follow: true } };

/** Served by the service worker when a page isn't saved on this device and there's no connection. */
export default function OfflinePage() {
  return (
    <main className="container page" id="main">
      <div className="notice">
        <h2>This page isn’t saved on this device</h2>
        <p>
          You’re offline. Lessons in a section you’ve opened are kept for offline use; this one wasn’t. Answers you give
          offline are saved and sent when you reconnect.
        </p>
        <p>
          <Link className="btn btn-primary" href="/">
            Dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
