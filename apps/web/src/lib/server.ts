import "server-only";
import { cookies } from "next/headers";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:4000";

export type ServerResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

/** Fetch from the API during server rendering, forwarding the learner's session cookie. */
export async function serverApi<T>(path: string): Promise<ServerResult<T>> {
  const jar = await cookies();
  const cookie = jar.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1${path}`, { headers: { cookie }, cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, error: json?.error ?? res.statusText };
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 503, error: "The HamPath API is not reachable. Is `pnpm dev` running?" };
  }
}
