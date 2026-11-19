/* HamPath service worker (SPEC §6 "Offline"): caches the app shell and the current section's
   lessons so they open without a connection. Grading stays on the server: answers made offline
   are queued by the page (src/lib/outbox.ts) and sent when the connection returns. */
const VERSION = "v2";
const STATIC = `hampath-static-${VERSION}`;
const PAGES = `hampath-pages-${VERSION}`;
const DATA = `hampath-data-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll([OFFLINE_URL, "/"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("hampath-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg";
const isCachedData = (url) =>
  url.pathname.startsWith("/api/v1/lessons/") ||
  url.pathname.startsWith("/api/v1/sections") ||
  url.pathname === "/api/v1/review/due";

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(STATIC)).put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached =
      (await cache.match(request, { ignoreVary: true })) ||
      (await caches.match(request, { ignoreVary: true })) ||
      // A lesson page cached without its ?card= deep link: the page picks the card up from the URL.
      (request.mode === "navigate" ? await caches.match(request, { ignoreVary: true, ignoreSearch: true }) : undefined);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response(JSON.stringify({ error: "You're offline and this isn't saved on this device yet." }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // writes go through the page's outbox
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES, OFFLINE_URL));
  } else if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(networkFirst(request, PAGES));
  } else if (isCachedData(url)) {
    event.respondWith(networkFirst(request, DATA));
  }
});

/** Every /_next/static file a page's HTML refers to (its scripts, styles and fonts). */
function staticRefs(html) {
  return [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])].slice(0, 80);
}

/** Store static files we don't have yet, so a cached page also runs offline. */
async function cacheStatic(urls) {
  const cache = await caches.open(STATIC);
  await Promise.all(
    urls.map(async (u) => {
      if (await cache.match(u)) return;
      const res = await fetch(u).catch(() => null);
      if (res && res.ok) await cache.put(u, res);
    }),
  );
}

/**
 * The page asks us to keep a section's lessons available offline: each page, plus the static files
 * it needs. (The labs' own code is fetched by the page itself and kept by the static rule above.)
 */
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type !== "cache-urls" || !Array.isArray(msg.urls)) return;
  event.waitUntil(
    caches.open(PAGES).then((cache) =>
      Promise.all(
        msg.urls
          .filter((u) => typeof u === "string" && u.startsWith("/"))
          .slice(0, 60)
          .map((u) =>
            fetch(u, { credentials: "same-origin" })
              .then(async (res) => {
                if (!res.ok) return;
                await cache.put(u, res.clone());
                await cacheStatic(staticRefs(await res.text()));
              })
              .catch(() => undefined),
          ),
      ),
    ),
  );
});
