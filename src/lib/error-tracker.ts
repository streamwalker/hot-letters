/**
 * Client-side error tracker.
 * Captures: window errors, unhandled promise rejections, console.error/warn,
 * failed fetch/XHR requests. Persists last N entries to localStorage.
 */

export type ErrorEntry = {
  id: string;
  ts: number; // ms epoch
  kind: "error" | "unhandledrejection" | "console" | "network";
  level: "error" | "warn" | "info";
  message: string;
  details?: string;
  url?: string;
  status?: number;
  method?: string;
  durationMs?: number;
  stack?: string;
};

const MAX = 200;
const KEY = "hl_error_log_v1";
const listeners = new Set<(entries: ErrorEntry[]) => void>();
let entries: ErrorEntry[] = [];
let installed = false;

function load(): ErrorEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ErrorEntry[]) : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {
    /* ignore quota */
  }
}

function emit() {
  const snapshot = entries.slice();
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch {
      /* listener errors must not loop */
    }
  }
}

function record(e: Omit<ErrorEntry, "id" | "ts"> & { ts?: number }) {
  const entry: ErrorEntry = {
    id: Math.random().toString(36).slice(2, 10),
    ts: e.ts ?? Date.now(),
    ...e,
  };
  entries.push(entry);
  if (entries.length > MAX) entries = entries.slice(-MAX);
  persist();
  emit();
}

function safeStringify(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function installErrorTracker() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  entries = load();

  window.addEventListener("error", (ev: ErrorEvent) => {
    record({
      kind: "error",
      level: "error",
      message: ev.message || "window error",
      url: ev.filename,
      stack: ev.error?.stack,
      details: ev.error ? safeStringify(ev.error) : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    record({
      kind: "unhandledrejection",
      level: "error",
      message:
        reason instanceof Error
          ? reason.message
          : safeStringify(reason) || "Unhandled promise rejection",
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  // Wrap console
  for (const lvl of ["error", "warn"] as const) {
    const orig = console[lvl].bind(console);
    console[lvl] = (...args: unknown[]) => {
      try {
        record({
          kind: "console",
          level: lvl,
          message: args.map(safeStringify).join(" "),
        });
      } catch {
        /* never block console */
      }
      orig(...args);
    };
  }

  // Wrap fetch
  const origFetch = window.fetch?.bind(window);
  if (origFetch) {
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const start = performance.now();
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      try {
        const resp = await origFetch(input, init);
        if (!resp.ok) {
          record({
            kind: "network",
            level: "error",
            message: `${method} ${url} → ${resp.status}`,
            url,
            method,
            status: resp.status,
            durationMs: Math.round(performance.now() - start),
          });
        }
        return resp;
      } catch (err) {
        record({
          kind: "network",
          level: "error",
          message: `${method} ${url} failed: ${err instanceof Error ? err.message : safeStringify(err)}`,
          url,
          method,
          durationMs: Math.round(performance.now() - start),
          stack: err instanceof Error ? err.stack : undefined,
        });
        throw err;
      }
    };
  }

  // Wrap XHR
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function (
      this: XMLHttpRequest & { __et?: { method: string; url: string; start: number } },
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      this.__et = { method: method.toUpperCase(), url: url.toString(), start: 0 };
      // @ts-expect-error pass-through
      return origOpen.call(this, method, url, ...rest);
    };
    XHR.prototype.send = function (
      this: XMLHttpRequest & { __et?: { method: string; url: string; start: number } },
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      const meta = this.__et;
      if (meta) meta.start = performance.now();
      const onEnd = () => {
        if (!meta) return;
        const dur = Math.round(performance.now() - meta.start);
        if (this.status === 0 || this.status >= 400) {
          record({
            kind: "network",
            level: "error",
            message: `${meta.method} ${meta.url} → ${this.status || "network error"}`,
            url: meta.url,
            method: meta.method,
            status: this.status || undefined,
            durationMs: dur,
          });
        }
      };
      this.addEventListener("loadend", onEnd);
      return origSend.call(this, body ?? null);
    };
  }

  // Public API
  (window as unknown as { __errorTracker: typeof api }).__errorTracker = api;
}

export function getEntries(): ErrorEntry[] {
  return entries.slice();
}

export function clearEntries() {
  entries = [];
  persist();
  emit();
}

export function subscribe(fn: (entries: ErrorEntry[]) => void): () => void {
  listeners.add(fn);
  fn(entries.slice());
  return () => listeners.delete(fn);
}

export function exportJson(): string {
  return JSON.stringify(entries, null, 2);
}

const api = { getEntries, clearEntries, subscribe, exportJson };
