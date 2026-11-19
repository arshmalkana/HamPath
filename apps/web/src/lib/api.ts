import { enqueue, isOffline } from "./outbox";

/** Browser-side API client. Same-origin /api/v1 (Next rewrites it to the API), so the session cookie is first-party. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error ?? `Request failed (${res.status})`, json?.details);
  return json as T;
}

let sessionPromise: Promise<unknown> | null = null;
/** Make sure this browser has a session (a guest one if not signed in). Idempotent. */
export function ensureSession() {
  sessionPromise ??= api("POST", "/auth/guest").catch((e) => {
    sessionPromise = null;
    throw e;
  });
  return sessionPromise;
}

/** Fire-and-forget telemetry; never blocks or breaks the lesson. */
export function track(path: string, body: unknown) {
  ensureSession()
    .then(() => api("POST", path, body))
    .catch((e) => {
      if (isOffline(e)) enqueue("POST", path, body);
    });
}
