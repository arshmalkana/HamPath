/**
 * Error monitoring: Sentry's SDK, which also talks to a self-hosted GlitchTip. Off unless
 * SENTRY_DSN is set. Only unexpected errors (500s) are reported; nothing about the learner is sent
 * beyond the route (no cookies, no request bodies).
 */
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN ?? "";

export function initMonitoring() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    release: process.env.APP_VERSION || undefined,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
          delete event.request.headers["x-admin-token"];
        }
      }
      return event;
    },
  });
}

export function reportError(err: unknown, context: { method: string; route: string }) {
  if (!dsn) return;
  Sentry.withScope((scope) => {
    scope.setTag("route", `${context.method} ${context.route}`);
    Sentry.captureException(err);
  });
}
