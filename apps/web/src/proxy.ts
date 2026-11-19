import { NextResponse, type NextRequest } from "next/server";

/**
 * Content Security Policy with a fresh nonce per request (Next stamps it on its own inline scripts,
 * and the layout puts it on the theme script). 'strict-dynamic' lets those trusted scripts load the
 * lazily imported lab chunks. Styles allow 'unsafe-inline' because the SVG labs set style attributes,
 * which a nonce can't cover; with scripts locked down that's low risk.
 */
function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  // Error monitoring (Sentry/GlitchTip) posts to its own host.
  const extraConnect = (process.env.CSP_CONNECT_EXTRA ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...extraConnect, ...(dev ? ["ws:"] : [])],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function proxy(request: NextRequest) {
  // The component gallery is a development tool (a real 404: the root loading boundary would
  // otherwise have started a 200 response before the page could call notFound()).
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_DEV_PAGES !== "1" &&
    request.nextUrl.pathname.startsWith("/dev")
  ) {
    return new NextResponse("Not found", { status: 404 });
  }
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  // Next reads the nonce from the request's CSP header; the layout reads x-nonce.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Pages only: not the API (proxied to Fastify, which sets its own headers), static files or the service worker.
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|icon.svg|sw.js|robots.txt).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
