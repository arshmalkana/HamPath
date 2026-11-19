/**
 * Offline outbox: writes that can't reach the server (answers, lab events, progress) are kept in
 * this browser and replayed in order when the connection returns. Grading happens on replay;
 * the server stays the only source of truth for correctness and mastery.
 */
const KEY = "hp-outbox";
type Method = "POST" | "PUT";
export interface Queued {
  method: Method;
  path: string;
  body: unknown;
  queuedAt: number;
}

function read(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function write(items: Queued[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked: the write is lost, as it would be without the outbox */
  }
  window.dispatchEvent(new CustomEvent("hp-outbox", { detail: answersIn(items) }));
}

const answersIn = (items: Queued[]) => items.filter((i) => i.path === "/attempts").length;

/** Answers waiting to be sent (progress and lab telemetry sync silently alongside). */
export function queued(): number {
  return answersIn(read());
}

export function enqueue(method: Method, path: string, body: unknown) {
  write([...read(), { method, path, body, queuedAt: Date.now() }]);
}

/** A fetch failure that means "no connection" rather than an answer from the server. */
export function isOffline(e: unknown) {
  return (typeof navigator !== "undefined" && !navigator.onLine) || e instanceof TypeError;
}

let flushing = false;
/**
 * Send everything queued, oldest first. Stops at the first network failure; drops items the server
 * rejects. Tabs share one queue, so a Web Lock lets only one tab replay at a time; answers and lab
 * events also carry a client_id, so even a replay whose reply was lost is counted once.
 */
export async function flush(): Promise<number> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks) return locks.request("hp-outbox", { ifAvailable: true }, (lock) => (lock ? flushHere() : 0));
  return flushHere();
}

async function flushHere(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    let items = read();
    while (items.length) {
      const [item, ...rest] = items;
      try {
        const res = await fetch(`/api/v1${item!.path}`, {
          method: item!.method,
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(item!.body),
        });
        if (res.status >= 500) break; // server trouble: keep it for later
      } catch {
        break; // still offline
      }
      sent++;
      items = rest;
      write(items);
    }
  } finally {
    flushing = false;
  }
  return sent;
}
