import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getEntries, exportJson } from "@/lib/error-tracker";

export const Route = createFileRoute("/diagnostics")({
  component: DiagnosticsPage,
  head: () => ({
    meta: [
      { title: "Level 10 Diagnostics" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Status = "pending" | "running" | "pass" | "fail" | "warn" | "skip";
type Severity = "low" | "medium" | "high" | "critical";

interface CheckResult {
  id: string;
  name: string;
  category: string;
  severity: Severity;
  status: Status;
  detail?: string;
  durationMs?: number;
  repro?: string;
}

type Check = {
  id: string;
  name: string;
  category: string;
  severity: Severity;
  repro: string;
  run: () => Promise<{ status: Status; detail?: string }>;
};

const CHECKS: Check[] = [
  {
    id: "env-supabase-url",
    name: "Supabase URL configured",
    category: "Environment",
    severity: "critical",
    repro: "Read import.meta.env.VITE_SUPABASE_URL — must be a non-empty https URL.",
    run: async () => {
      const url = (import.meta as any).env?.VITE_SUPABASE_URL;
      if (!url) return { status: "fail", detail: "VITE_SUPABASE_URL missing" };
      if (!/^https:\/\//.test(url)) return { status: "fail", detail: `Invalid URL: ${url}` };
      return { status: "pass", detail: url };
    },
  },
  {
    id: "env-supabase-key",
    name: "Supabase publishable key present",
    category: "Environment",
    severity: "critical",
    repro: "Check VITE_SUPABASE_PUBLISHABLE_KEY length > 50.",
    run: async () => {
      const key = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!key || key.length < 50) return { status: "fail", detail: "Missing/short key" };
      return { status: "pass", detail: `${key.slice(0, 12)}…` };
    },
  },
  {
    id: "supabase-session",
    name: "Auth session reachable",
    category: "Auth",
    severity: "high",
    repro: "supabase.auth.getSession() must resolve without error.",
    run: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) return { status: "fail", detail: error.message };
      return {
        status: "pass",
        detail: data.session ? `signed in as ${data.session.user.email}` : "no active session",
      };
    },
  },
  {
    id: "ocr-route-method-guard",
    name: "/api/ocr-script rejects GET",
    category: "API",
    severity: "medium",
    repro: "fetch('/api/ocr-script') — POST-only endpoint should return 404/405, not 200.",
    run: async () => {
      const res = await fetch("/api/ocr-script", { method: "GET" });
      if (res.status === 200) return { status: "fail", detail: "GET returned 200" };
      return { status: "pass", detail: `status ${res.status}` };
    },
  },
  {
    id: "ocr-route-empty-body",
    name: "/api/ocr-script validates input",
    category: "API",
    severity: "medium",
    repro: "POST empty JSON to /api/ocr-script — should return 4xx, not 5xx or 200.",
    run: async () => {
      const res = await fetch("/api/ocr-script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (res.status >= 200 && res.status < 300)
        return { status: "fail", detail: "accepted empty body" };
      if (res.status >= 500) return { status: "warn", detail: `server error ${res.status}` };
      return { status: "pass", detail: `status ${res.status}` };
    },
  },
  {
    id: "router-home",
    name: "Home route reachable",
    category: "Routing",
    severity: "high",
    repro: "fetch('/') should return HTML 200.",
    run: async () => {
      const res = await fetch("/", { headers: { accept: "text/html" } });
      if (!res.ok) return { status: "fail", detail: `status ${res.status}` };
      const text = await res.text();
      if (!text.includes("<html")) return { status: "warn", detail: "no <html> tag" };
      return { status: "pass", detail: `${text.length} bytes` };
    },
  },
  {
    id: "router-login",
    name: "Login route reachable",
    category: "Routing",
    severity: "high",
    repro: "fetch('/login') should return 200.",
    run: async () => {
      const res = await fetch("/login", { headers: { accept: "text/html" } });
      if (!res.ok) return { status: "fail", detail: `status ${res.status}` };
      return { status: "pass", detail: `status ${res.status}` };
    },
  },
  {
    id: "router-404",
    name: "Unknown route returns 404 boundary",
    category: "Routing",
    severity: "low",
    repro: "fetch('/__nope_' + Date.now()) should not 500.",
    run: async () => {
      const res = await fetch(`/__nope_${Date.now()}`, { headers: { accept: "text/html" } });
      if (res.status >= 500) return { status: "fail", detail: `status ${res.status}` };
      return { status: "pass", detail: `status ${res.status}` };
    },
  },
  {
    id: "favicon",
    name: "Favicon present",
    category: "Branding",
    severity: "low",
    repro: "fetch('/favicon.png') should return 200.",
    run: async () => {
      const res = await fetch("/favicon.png");
      if (!res.ok) return { status: "fail", detail: `status ${res.status}` };
      return { status: "pass" };
    },
  },
  {
    id: "og-image",
    name: "OG image present",
    category: "Branding",
    severity: "low",
    repro: "fetch('/og-image.png') should return 200.",
    run: async () => {
      const res = await fetch("/og-image.png");
      if (!res.ok) return { status: "warn", detail: `status ${res.status}` };
      return { status: "pass" };
    },
  },
  {
    id: "localstorage",
    name: "localStorage writable",
    category: "Browser",
    severity: "medium",
    repro: "Write+read+delete a probe key in localStorage.",
    run: async () => {
      try {
        const k = "__diag_probe__";
        localStorage.setItem(k, "1");
        const ok = localStorage.getItem(k) === "1";
        localStorage.removeItem(k);
        return ok ? { status: "pass" } : { status: "fail", detail: "read mismatch" };
      } catch (e: any) {
        return { status: "fail", detail: e?.message ?? "throw" };
      }
    },
  },
  {
    id: "error-tracker",
    name: "Error tracker installed",
    category: "Observability",
    severity: "low",
    repro: "window.__errorTracker should expose getEntries().",
    run: async () => {
      const t = (window as any).__errorTracker;
      if (!t || typeof t.getEntries !== "function")
        return { status: "fail", detail: "not installed" };
      return { status: "pass", detail: `${t.getEntries().length} entries` };
    },
  },
  {
    id: "console-error-rate",
    name: "Recent console errors",
    category: "Observability",
    severity: "medium",
    repro: "Count entries with level=error in the last 5 minutes.",
    run: async () => {
      const cutoff = Date.now() - 5 * 60_000;
      const errs = getEntries().filter((e) => e.level === "error" && e.ts >= cutoff);
      if (errs.length > 5) return { status: "warn", detail: `${errs.length} errors in last 5m` };
      return { status: "pass", detail: `${errs.length} errors in last 5m` };
    },
  },
  {
    id: "network-failure-rate",
    name: "Recent network failures",
    category: "Observability",
    severity: "medium",
    repro: "Count network entries with status>=500 in the last 5 minutes.",
    run: async () => {
      const cutoff = Date.now() - 5 * 60_000;
      const fails = getEntries().filter(
        (e) => e.kind === "network" && (e.status ?? 0) >= 500 && e.ts >= cutoff,
      );
      if (fails.length > 0) return { status: "warn", detail: `${fails.length} 5xx in last 5m` };
      return { status: "pass", detail: "0 5xx" };
    },
  },
];

const STATUS_STYLES: Record<Status, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  pass: "bg-green-500/20 text-green-700 dark:text-green-300",
  fail: "bg-destructive/20 text-destructive",
  warn: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  skip: "bg-muted text-muted-foreground",
};

const SEV_STYLES: Record<Severity, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  high: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
  critical: "bg-destructive/20 text-destructive",
};

function DiagnosticsPage() {
  const [results, setResults] = useState<Record<string, CheckResult>>(() =>
    Object.fromEntries(
      CHECKS.map((c) => [
        c.id,
        {
          id: c.id,
          name: c.name,
          category: c.category,
          severity: c.severity,
          status: "pending" as Status,
          repro: c.repro,
        },
      ]),
    ),
  );
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  const runAll = useCallback(async () => {
    setRunning(true);
    setStartedAt(Date.now());
    setFinishedAt(null);
    for (const check of CHECKS) {
      setResults((r) => ({ ...r, [check.id]: { ...r[check.id], status: "running" } }));
      const t0 = performance.now();
      try {
        const out = await check.run();
        const dt = Math.round(performance.now() - t0);
        setResults((r) => ({
          ...r,
          [check.id]: { ...r[check.id], ...out, durationMs: dt },
        }));
      } catch (e: any) {
        setResults((r) => ({
          ...r,
          [check.id]: {
            ...r[check.id],
            status: "fail",
            detail: e?.message ?? String(e),
            durationMs: Math.round(performance.now() - t0),
          },
        }));
      }
    }
    setRunning(false);
    setFinishedAt(Date.now());
  }, []);

  const runOne = useCallback(async (id: string) => {
    const check = CHECKS.find((c) => c.id === id);
    if (!check) return;
    setResults((r) => ({ ...r, [id]: { ...r[id], status: "running" } }));
    const t0 = performance.now();
    try {
      const out = await check.run();
      setResults((r) => ({
        ...r,
        [id]: { ...r[id], ...out, durationMs: Math.round(performance.now() - t0) },
      }));
    } catch (e: any) {
      setResults((r) => ({
        ...r,
        [id]: {
          ...r[id],
          status: "fail",
          detail: e?.message ?? String(e),
          durationMs: Math.round(performance.now() - t0),
        },
      }));
    }
  }, []);

  const summary = Object.values(results).reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<Status, number>,
  );

  const downloadReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      startedAt: startedAt ? new Date(startedAt).toISOString() : null,
      finishedAt: finishedAt ? new Date(finishedAt).toISOString() : null,
      durationMs: startedAt && finishedAt ? finishedAt - startedAt : null,
      summary,
      results: Object.values(results),
      errorTrackerEntries: JSON.parse(exportJson()),
      userAgent: navigator.userAgent,
      url: window.location.href,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const grouped = CHECKS.reduce(
    (acc, c) => {
      (acc[c.category] ||= []).push(c);
      return acc;
    },
    {} as Record<string, Check[]>,
  );

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Level 10 Diagnostics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              On-demand health checks across environment, auth, routing, API, and observability.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={runAll}
              disabled={running}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {running ? "Running…" : "Run all checks"}
            </button>
            <button
              onClick={downloadReport}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Download JSON report
            </button>
          </div>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(["pass", "warn", "fail", "skip", "pending"] as Status[]).map((s) => (
            <div key={s} className="rounded-md border border-border bg-card p-3">
              <div className="text-xs uppercase text-muted-foreground">{s}</div>
              <div className="text-2xl font-semibold">{summary[s] ?? 0}</div>
            </div>
          ))}
        </div>

        {Object.entries(grouped).map(([category, checks]) => (
          <section key={category} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {category}
            </h2>
            <ul className="overflow-hidden rounded-md border border-border bg-card">
              {checks.map((c) => {
                const r = results[c.id];
                return (
                  <li
                    key={c.id}
                    className="flex flex-col gap-2 border-b border-border p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[r.status]}`}
                        >
                          {r.status}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${SEV_STYLES[c.severity]}`}
                        >
                          {c.severity}
                        </span>
                        <span className="font-medium">{c.name}</span>
                        {typeof r.durationMs === "number" && (
                          <span className="text-xs text-muted-foreground">{r.durationMs}ms</span>
                        )}
                      </div>
                      {r.detail && (
                        <div className="mt-1 break-all text-xs text-muted-foreground">
                          {r.detail}
                        </div>
                      )}
                      <details className="mt-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Reproduce</summary>
                        <p className="mt-1 whitespace-pre-wrap">{c.repro}</p>
                      </details>
                    </div>
                    <button
                      onClick={() => runOne(c.id)}
                      disabled={running || r.status === "running"}
                      className="self-start rounded-md border border-input bg-background px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50 sm:self-auto"
                    >
                      Re-run
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <p className="mt-8 text-xs text-muted-foreground">
          Tip: bookmark <code>/diagnostics</code> to run this any time.
        </p>
      </div>
    </div>
  );
}
