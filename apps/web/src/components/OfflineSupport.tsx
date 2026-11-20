"use client";
import { useEffect, useState } from "react";
import { ensureSession } from "@/lib/api";
import { flush, queued } from "@/lib/outbox";

/**
 * Registers the service worker (production builds, or any build with localStorage hp-sw=1),
 * shows an offline banner, and replays queued answers when the connection returns.
 */
export function OfflineSupport() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let wantSw = process.env.NODE_ENV === "production";
    try {
      wantSw ||= localStorage.getItem("hp-sw") === "1";
    } catch {
      /* ignore */
    }
    if (wantSw && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    } else if ("serviceWorker" in navigator) {
      // A worker left on this origin (a production build once served here, or hp-sw=1 earlier)
      // would keep serving cached /_next/static chunks; in dev those change under the same name,
      // which breaks the page ("module factory is not available"). Remove it and its caches.
      void navigator.serviceWorker.getRegistrations().then(async (regs) => {
        if (!regs.length) return;
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = await caches.keys().catch(() => [] as string[]);
        await Promise.all(keys.filter((k) => k.startsWith("hampath-")).map((k) => caches.delete(k)));
        // The page that just loaded may already hold stale chunks: load it once more from the server.
        window.location.reload();
      });
    }
    const sync = () => {
      setOnline(navigator.onLine);
      setPending(queued());
    };
    const reconnect = () => {
      sync();
      void ensureSession()
        .catch(() => undefined)
        .then(() => flush())
        .then(sync);
    };
    const onCount = (e: Event) => setPending((e as CustomEvent<number>).detail);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", sync);
    window.addEventListener("hp-outbox", onCount);
    const t = setTimeout(reconnect, 0); // send anything left from a previous visit
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", sync);
      window.removeEventListener("hp-outbox", onCount);
    };
  }, []);

  if (online && pending === 0) return null;
  return (
    <div className="offline-banner" role="status">
      {online
        ? `Sending ${pending} saved answer${pending === 1 ? "" : "s"}…`
        : `You’re offline. Lessons you’ve opened in this section still work${pending ? `, and ${pending} answer${pending === 1 ? " is" : "s are"} saved to send later` : "; answers are saved and sent when you reconnect"}.`}
    </div>
  );
}

/** Ask the service worker to keep these pages available offline. */
export function cacheForOffline(urls: string[]) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: "cache-urls", urls });
}
