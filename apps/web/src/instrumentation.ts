/**
 * Server-side error monitoring (Sentry SDK; works with self-hosted GlitchTip). Off unless
 * SENTRY_DSN is set at runtime.
 */
export async function register() {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    release: process.env.APP_VERSION || undefined,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
}

/** Errors thrown while rendering a page or running a route handler. */
export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
