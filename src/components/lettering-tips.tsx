import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink, X } from "lucide-react";

/**
 * Lettering Tips — incorporates Nate Piekos / Blambot's "Better Letterer" guidance
 * (https://blambot.com/pages/lettering-tips) into the platform in two ways:
 *
 *  1. Reference tab: in-app gallery of the 24 "Better Letterer" infographics so
 *     letterers can look up the rule without leaving the editor.
 *  2. Check tab: a live linter that reads the current project's balloons via
 *     window.__letterer.serialize() and flags any text that violates the
 *     mechanical, programmatically-checkable Blambot rules (caps, ellipsis,
 *     em-dash, double spaces, straight quotes, double letters, etc.).
 *
 * Mounted by src/routes/_authenticated/index.tsx as a floating launcher.
 */

// ---- Reference infographics (Blambot CDN, public marketing assets) ----------
const TIP_IMAGES: string[] = [
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl001_20322a29-29ff-46de-8c8d-6900ec9a8817_800x800.jpg?v=1723484600",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl002_1000x1000.jpg?v=1613697838",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl003_1200x1200.jpg?v=1613697838",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl004_5b1c5103-7b5e-447b-8df2-ed88cf593b2c_1200x1200.jpg?v=1723732413",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl005_1200x1200.jpg?v=1613697838",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl006_dad23de0-cc02-44a3-9a2a-125621428ca3_1200x1200.jpg?v=1724087239",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl007_6bdc7889-5253-439f-8767-b058e719f600_1200x1200.jpg?v=1724174065",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl008_65c553bd-83b0-4ac8-9f52-2408e0d21393_1000x1000.jpg?v=1724252381",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl009_9ec084c7-dbb2-4781-a018-713b5f76e0a2_1200x1200.jpg?v=1724338062",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl010_027df8ab-366c-4e35-8c30-5e1fd4bf0fae_1000x1000.jpg?v=1724418961",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl011_a6b47b47-f689-4176-b97c-7b85e5b2c873_800x800.jpg?v=1724691013",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl012_c9779c21-2e34-44e7-882d-e26480ae6950_800x800.jpg?v=1724768546",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl013_8df524db-d27e-4334-96cb-c318a473f5f3_800x800.jpg?v=1724860421",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl014_45c9d01c-93f2-4d66-b7f6-db7d5e43f200_800x800.jpg?v=1724940045",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl015_57c02468-c56c-4465-b9e8-2354d65ae5f8_1200x1200.jpg?v=1725029175",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl016_9a98f0c7-0722-48d9-87b3-b2f58af228c8_800x800.jpg?v=1725371538",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl017_5b9ffa8a-c8d2-46d3-8289-ecef7a4f9342_1200x1200.jpg?v=1725457078",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl018_800x800.jpg?v=1613745639",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl019_1200x1200.jpg?v=1615305833",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl020_1321d6f4-b153-4d9e-9859-13e220410fd7_800x800.jpg?v=1725632218",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl021_1200x1200.jpg?v=1673975806",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl022_1600x1600.jpg?v=1691592407",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl023_e9b52159-aff2-4bb0-b95e-8763a64ac2be_800x800.jpg?v=1726149897",
  "https://cdn.shopify.com/s/files/1/0152/5779/6662/files/bl024_1200x1200.jpg?v=1728321324",
];

// ---- Linter ----------------------------------------------------------------

type Balloon = {
  id: string;
  text: string;
  shape?: string;     // ellipse | cloud | rect | burst
  font?: string;
  tail?: boolean;
  tailStyle?: string;
  textColor?: string;
  // The editor uses presets, not an explicit modifier. We approximate from shape/font.
};

type Severity = "error" | "warn" | "info";

type Issue = {
  balloonId: string;
  severity: Severity;
  rule: string;
  message: string;
  preview: string;
};

const SFX_FONT_HINT = /bangers|impact|bungee|luckiest/i;
const CAPTION_SHAPE = "rect";
const THOUGHT_SHAPE = "cloud";

function isSfx(b: Balloon): boolean {
  // Default sfx preset uses Bangers + transparent fill; we treat any
  // burst-font balloon with no body as sfx-like for caps purposes.
  return !!(b.font && SFX_FONT_HINT.test(b.font) && b.tail === false);
}

function previewOf(text: string): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

// Heuristic detector for ALL-CAPS rule. Comic dialogue is set in upper case;
// lowercase letters appear only in the rare lowercase-stylized balloon. We
// flag any lowercase ASCII letter in a non-SFX balloon, but ignore the
// dictionary word "i" because the next rule handles it explicitly.
function findLowercaseRuns(text: string): string[] {
  const matches = text.match(/[a-z]+/g) || [];
  return matches.filter((m) => m.length > 0);
}

function lintBalloon(b: Balloon): Issue[] {
  const issues: Issue[] = [];
  const text = b.text || "";
  if (!text.trim()) return issues;
  const preview = previewOf(text);
  const sfx = isSfx(b);
  const caption = b.shape === CAPTION_SHAPE;
  const thought = b.shape === THOUGHT_SHAPE;

  const push = (severity: Severity, rule: string, message: string) =>
    issues.push({ balloonId: b.id, severity, rule, message, preview });

  // 1. Three periods → ellipsis (…). Comic lettering convention.
  if (/\.{3,}/.test(text)) {
    push("warn", "Ellipsis", "Use a single ellipsis character (…) instead of three periods (...).");
  }

  // 2. Double hyphen → em-dash (—).
  if (/--/.test(text)) {
    push("warn", "Em-dash", "Use an em-dash (—) instead of a double hyphen (--).");
  }

  // 3. Straight double-quote — comic balloons use curly quotes or none.
  if (/["']{2,}/.test(text) || /(^|[^a-zA-Z])"|"([^a-zA-Z]|$)/.test(text)) {
    push("info", "Quotes", "Avoid straight double quotes in balloons; use curly quotes (“ ”) or drop them.");
  }

  // 4. Double spaces.
  if (/ {2,}/.test(text)) {
    push("warn", "Spacing", "Remove the double space — balloons should have single spaces between words.");
  }

  // 5. Leading or trailing whitespace.
  if (/^\s|\s$/.test(text)) {
    push("info", "Spacing", "Trim leading or trailing whitespace from the balloon text.");
  }

  // 6. Digits in dialogue — Blambot recommends spelling out small numbers.
  if (!caption && /\b\d+\b/.test(text)) {
    const nums = (text.match(/\b\d+\b/g) || []).slice(0, 3).join(", ");
    push(
      "info",
      "Numbers",
      `Spell out numbers in dialogue (found: ${nums}). Digits are reserved for captions and signage.`,
    );
  }

  // 7. Caps rule for spoken balloons. SFX may stylize; captions traditionally
  // use mixed case so we don't enforce caps there.
  if (!sfx && !caption) {
    const lower = findLowercaseRuns(text);
    // Allow standalone "i" only as a flagged separate rule below.
    const offenders = lower.filter((w) => !(w === "i"));
    if (offenders.length) {
      const sample = offenders.slice(0, 3).join(", ");
      push(
        "warn",
        "Caps",
        `Comic dialogue is set in ALL CAPS — found lowercase: ${sample}.`,
      );
    }
  }

  // 8. Standalone lowercase "i".
  if (!caption && /\bi\b/.test(text)) {
    push("error", "Capital I", "The pronoun “I” must always be capitalized.");
  }

  // 9. SFX must be all caps (and non-empty).
  if (sfx) {
    if (/[a-z]/.test(text)) {
      push("warn", "SFX caps", "Sound effects are typically set in ALL CAPS for impact.");
    }
  }

  // 10. Stretched repeats: more than 3 of the same letter in a row (e.g. "AHHHHH").
  //     Blambot's rule: cap to roughly 3, then add punctuation for intensity.
  const longRun = text.match(/([A-Za-z])\1{3,}/);
  if (longRun) {
    push(
      "info",
      "Repeated letters",
      `“${longRun[0]}” has more than 3 repeated letters — try shortening (e.g. “${longRun[1].repeat(3).toUpperCase()}!”).`,
    );
  }

  // 11. Hyphenated line break — flag a hyphen at the end of a soft line break.
  if (/-\n/.test(text)) {
    push("warn", "Hyphenation", "Avoid hyphenating words across lines inside a balloon — resize instead.");
  }

  // 12. Caption boxes shouldn't have a pointer tail.
  if (caption && b.tail) {
    push("info", "Caption tail", "Caption boxes traditionally don't have a tail — toggle the tail off.");
  }

  // 13. Speech balloons should have a tail to point at the speaker.
  if (!sfx && !caption && !thought && b.tail === false) {
    push("info", "Missing tail", "Speech balloons need a tail so readers know who's talking.");
  }

  // 14. Ampersand in dialogue — Blambot recommends spelling out "and".
  if (!caption && /&/.test(text)) {
    push("info", "Ampersand", "Spell out “AND” in dialogue; reserve & for logos and signage.");
  }

  return issues;
}

function runLint(): { issues: Issue[]; balloonCount: number } {
  if (typeof window === "undefined" || !window.__letterer) {
    return { issues: [], balloonCount: 0 };
  }
  let data: unknown;
  try {
    data = window.__letterer.serialize();
  } catch {
    return { issues: [], balloonCount: 0 };
  }
  const balloons = ((data as { balloons?: Balloon[] } | undefined)?.balloons ?? []) as Balloon[];
  const issues: Issue[] = [];
  for (const b of balloons) issues.push(...lintBalloon(b));
  return { issues, balloonCount: balloons.length };
}

declare global {
  interface Window {
    __letterer?: {
      serialize: () => unknown;
      load: (data: unknown) => void;
      selectBalloon?: (id: string) => boolean;
    };
  }
}

// ---- UI --------------------------------------------------------------------

type Tab = "reference" | "check";

export function LetteringTips() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("check");
  const [{ issues, balloonCount }, setReport] = useState<{ issues: Issue[]; balloonCount: number }>(
    { issues: [], balloonCount: 0 },
  );

  const refresh = useCallback(() => setReport(runLint()), []);

  // Re-lint whenever the panel opens or the editor signals a change.
  useEffect(() => {
    if (!open) return;
    refresh();
    let pending = false;
    const handler = () => {
      if (pending) return;
      pending = true;
      window.setTimeout(() => { pending = false; refresh(); }, 400);
    };
    window.addEventListener("letterer:change", handler);
    return () => window.removeEventListener("letterer:change", handler);
  }, [open, refresh]);

  const grouped = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of issues) {
      const arr = map.get(i.balloonId) ?? [];
      arr.push(i);
      map.set(i.balloonId, arr);
    }
    return Array.from(map.entries());
  }, [issues]);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warn").length;

  const launcherStyle: React.CSSProperties = {
    position: "fixed",
    left: 16,
    bottom: 130,
    zIndex: 1600,
    pointerEvents: "auto",
    background: "rgba(20, 26, 38, 0.88)",
    color: "#e6f1ff",
    border: "1px solid rgba(120, 180, 255, 0.35)",
    borderRadius: 10,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 11,
    letterSpacing: 0.3,
    padding: "6px 10px",
    cursor: "pointer",
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };

  if (!open) {
    const badge =
      issues.length > 0
        ? ` · ${errorCount + warnCount || issues.length}`
        : "";
    return (
      <button
        type="button"
        style={launcherStyle}
        onClick={() => { setOpen(true); refresh(); }}
        aria-label="Open lettering tips"
        title="Lettering tips & check (Blambot)"
      >
        <BookOpen size={13} />
        <span>Tips{badge}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close lettering tips"
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2300,
          background: "rgba(2, 8, 15, 0.55)",
          border: 0,
          cursor: "default",
        }}
      />
      <aside
        role="dialog"
        aria-label="Lettering tips"
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: "min(480px, 92vw)",
          zIndex: 2350,
          background: "rgba(12, 18, 30, 0.97)",
          color: "#e6f1ff",
          borderLeft: "1px solid rgba(120, 180, 255, 0.25)",
          boxShadow: "-10px 0 30px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 14px",
            borderBottom: "1px solid rgba(120, 180, 255, 0.18)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BookOpen size={16} />
            <strong style={{ letterSpacing: 0.6, fontSize: 13 }}>LETTERING TIPS</strong>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              background: "transparent",
              color: "#a9c2e6",
              border: 0,
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </header>

        <nav
          role="tablist"
          aria-label="Lettering tips sections"
          style={{
            display: "flex",
            borderBottom: "1px solid rgba(120, 180, 255, 0.18)",
          }}
        >
          {(
            [
              { id: "check", label: "Check" },
              { id: "reference", label: "Reference" },
            ] as { id: Tab; label: string }[]
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  background: active ? "rgba(120, 180, 255, 0.12)" : "transparent",
                  color: active ? "#e6f1ff" : "#a9c2e6",
                  border: 0,
                  borderBottom: active ? "2px solid #7ec1ff" : "2px solid transparent",
                  padding: "10px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  letterSpacing: 0.4,
                  fontWeight: 600,
                }}
              >
                {t.label}
                {t.id === "check" && issues.length > 0 && (
                  <span
                    style={{
                      marginLeft: 6,
                      background: errorCount ? "#e94560" : "#d4a017",
                      color: "#fff",
                      borderRadius: 10,
                      padding: "1px 6px",
                      fontSize: 10,
                    }}
                  >
                    {issues.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1, overflow: "auto" }}>
          {tab === "check" ? (
            <CheckPanel
              issues={issues}
              grouped={grouped}
              balloonCount={balloonCount}
              onRefresh={refresh}
            />
          ) : (
            <ReferencePanel />
          )}
        </div>

        <footer
          style={{
            padding: "8px 14px",
            borderTop: "1px solid rgba(120, 180, 255, 0.18)",
            fontSize: 10,
            color: "#7d97b8",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Tips by Nate Piekos (Blambot)</span>
          <a
            href="https://blambot.com/pages/lettering-tips"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#7ec1ff",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Source <ExternalLink size={10} />
          </a>
        </footer>
      </aside>
    </>
  );
}

// ---- Check tab -------------------------------------------------------------

function CheckPanel({
  issues,
  grouped,
  balloonCount,
  onRefresh,
}: {
  issues: Issue[];
  grouped: [string, Issue[]][];
  balloonCount: number;
  onRefresh: () => void;
}) {
  const clean = balloonCount > 0 && issues.length === 0;

  return (
    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#a9c2e6",
        }}
      >
        <span>
          Checked {balloonCount} balloon{balloonCount === 1 ? "" : "s"} ·{" "}
          {issues.length} issue{issues.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          title="Re-run check"
          style={{
            background: "transparent",
            color: "#7ec1ff",
            border: "1px solid rgba(120, 180, 255, 0.35)",
            borderRadius: 6,
            padding: "3px 8px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
          }}
        >
          <RefreshCw size={11} /> Re-check
        </button>
      </div>

      {balloonCount === 0 && (
        <p style={{ fontSize: 12, color: "#7d97b8", margin: 0 }}>
          No balloons on the page yet. Add a balloon and Hot Letters will check it against Blambot's
          professional lettering rules automatically.
        </p>
      )}

      {clean && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 14px",
            background: "rgba(126, 255, 208, 0.08)",
            border: "1px solid rgba(126, 255, 208, 0.3)",
            borderRadius: 8,
            color: "#7effd0",
            fontSize: 12,
          }}
        >
          <CheckCircle2 size={16} />
          <span>All balloons pass the Blambot check.</span>
        </div>
      )}

      {grouped.map(([balloonId, list]) => (
        <article
          key={balloonId}
          style={{
            background: "rgba(120, 180, 255, 0.05)",
            border: "1px solid rgba(120, 180, 255, 0.18)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <header style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#a9c2e6", fontStyle: "italic" }}>
              “{list[0].preview}”
            </span>
            <button
              type="button"
              onClick={() => window.__letterer?.selectBalloon?.(balloonId)}
              style={{
                background: "transparent",
                color: "#7ec1ff",
                border: 0,
                cursor: "pointer",
                fontSize: 10,
                padding: 0,
                whiteSpace: "nowrap",
              }}
              title="Select this balloon"
            >
              Select →
            </button>
          </header>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
            {list.map((i, idx) => (
              <li
                key={idx}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  fontSize: 12,
                  lineHeight: 1.35,
                }}
              >
                <SeverityIcon severity={i.severity} />
                <div>
                  <strong style={{ color: "#e6f1ff" }}>{i.rule}.</strong>{" "}
                  <span style={{ color: "#c8d6ed" }}>{i.message}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "error") return <AlertTriangle size={13} color="#ff6b81" style={{ marginTop: 2, flexShrink: 0 }} />;
  if (severity === "warn") return <AlertTriangle size={13} color="#ffc878" style={{ marginTop: 2, flexShrink: 0 }} />;
  return <CheckCircle2 size={13} color="#7ec1ff" style={{ marginTop: 2, flexShrink: 0 }} />;
}

// ---- Reference tab ---------------------------------------------------------

function ReferencePanel() {
  return (
    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12, color: "#a9c2e6", lineHeight: 1.5 }}>
        Nate Piekos's <em>Better Letterer</em> series. Each card is a professional rule you can
        apply while you work — balloon shapes, tail placement, kerning, SFX, emphasis, double
        letters, and more.
      </p>
      {TIP_IMAGES.map((src, i) => (
        <a
          key={src}
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid rgba(120, 180, 255, 0.18)",
            background: "#0a121f",
          }}
          title={`Better Letterer #${String(i + 1).padStart(2, "0")} (open full size)`}
        >
          <img
            src={src}
            alt={`Better Letterer tip #${i + 1} by Nate Piekos`}
            loading="lazy"
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        </a>
      ))}
    </div>
  );
}
