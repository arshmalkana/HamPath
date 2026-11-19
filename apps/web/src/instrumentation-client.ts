/**
 * Browser error monitoring. NEXT_PUBLIC_SENTRY_DSN is fixed at build time; when it's empty this
 * whole block is dropped and the SDK isn't downloaded. When set, it loads after the page does.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
      tracesSampleRate: 0,
      sendDefaultPii: false,
    }),
  );
}
