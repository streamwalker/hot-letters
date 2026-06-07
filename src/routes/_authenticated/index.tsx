import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Ships, ConsoleScreen } from "@/components/scene-motion";
import { ProjectManager } from "@/components/project-manager";
import { LetteringTips } from "@/components/lettering-tips";
import "../../letterer.css";
import bodyHtml from "../../letterer-body.html?raw";
import appJs from "../../letterer-app.js?raw";
import bridgeJs from "../../letterer-bridge.js?raw";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no",
      },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "theme-color", content: "#1a1d23" },
      { title: "Hot Letters - powered by Celsius" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bangers&family=Bungee&family=Comic+Neue:wght@400;700&family=Kalam:wght@400;700&family=Luckiest+Guy&family=Permanent+Marker&display=swap",
      },
    ],
  }),
  component: Letterer,
});

declare global {
  interface Window {
    __letterer?: {
      serialize: () => unknown;
      load: (data: unknown) => void;
      selectBalloon?: (id: string) => boolean;
    };
  }
}


function Letterer() {
  const ranRef = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);


  // When the dialog opens, remember focus and move it to the destructive
  // action; restore focus on close.
  useEffect(() => {
    if (!confirmOpen) return;
    lastFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setConfirmOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastFocusedRef.current?.focus?.();
    };
  }, [confirmOpen]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const s1 = document.createElement("script");
    s1.textContent = appJs as string;
    document.body.appendChild(s1);

    const s2 = document.createElement("script");
    s2.textContent = bridgeJs as string;
    document.body.appendChild(s2);

    // ----- Hologram pulse wiring ---------------------------------------
    // Map action buttons → pulse kinds. Capture phase so we fire even if
    // the inner handler stops propagation. Cooldown prevents flooding.
    const BTN_KINDS: Record<string, "save" | "export" | "parse" | "balloon"> = {
      "btn-save": "save",
      "btn-export-png": "export",
      "btn-parse": "parse",
      "btn-parse-ai": "parse",
      "btn-parse-photo": "parse",
      "btn-add-balloon": "balloon",
    };
    const STRENGTH: Record<string, number> = {
      save: 1.0, export: 1.0, parse: 0.8, balloon: 0.5, autosave: 0.35,
    };
    const lastPulseAt: Record<string, number> = {};
    const COOLDOWN_MS = 250;
    function firePulse(kind: string) {
      const now = Date.now();
      if (now - (lastPulseAt[kind] ?? 0) < COOLDOWN_MS) return;
      lastPulseAt[kind] = now;
      window.dispatchEvent(
        new CustomEvent("holo:pulse", {
          detail: { kind, strength: STRENGTH[kind] ?? 0.6 },
        }),
      );
    }
    function onClickCapture(e: Event) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const btn = target.closest?.("button, label") as HTMLElement | null;
      if (!btn?.id) return;
      const kind = BTN_KINDS[btn.id];
      if (kind) firePulse(kind);
    }
    document.addEventListener("click", onClickCapture, true);
    // Autosave pulse — debounced separately from cooldown.
    let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
    function onAutosaveChange() {
      if (autosaveTimer) return;
      autosaveTimer = setTimeout(() => {
        autosaveTimer = null;
        firePulse("autosave");
      }, 600);
    }
    window.addEventListener("letterer:change", onAutosaveChange);
    // -------------------------------------------------------------------

    return () => {
      window.removeEventListener("letterer:change", onAutosaveChange);
      document.removeEventListener("click", onClickCapture, true);
      if (autosaveTimer) clearTimeout(autosaveTimer);
      s1.remove();
      s2.remove();
    };
  }, []);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // Wipe local + remote sessions across all tabs.
      await supabase.auth.signOut({ scope: "global" });
    } catch (err) {
      console.error("Sign out failed", err);
    } finally {
      // Hard navigate so any in-memory state from the editor is dropped.
      // Preserve where the user was so we can return them here after
      // they sign back in.
      const here = window.location.pathname + window.location.search + window.location.hash;
      const params = new URLSearchParams({ signedOut: "1" });
      if (here && here !== "/login") params.set("redirect", here);
      window.location.assign(`/login?${params.toString()}`);
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={signingOut}
        aria-label="Sign out and return to the login page"
        aria-haspopup="dialog"
        aria-expanded={confirmOpen}
        aria-busy={signingOut}
        style={{
          position: "fixed",
          top: 8,
          right: 8,
          zIndex: 2000,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "#2c313a",
          color: "#e6e9ef",
          border: "1px solid #3a414d",
          padding: "6px 12px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.3,
          cursor: signingOut ? "wait" : "pointer",
          opacity: signingOut ? 0.7 : 1,
        }}
        title="Sign out"
      >
        <span aria-hidden="true">⎋</span>
        {signingOut ? "Signing out…" : "Log out"}
      </button>
      {confirmOpen && !signingOut && (
        <div
          role="presentation"
          onClick={() => setConfirmOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2500,
            background: "rgba(8, 18, 36, 0.55)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="signout-title"
            aria-describedby="signout-desc"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: "rgba(20, 26, 38, 0.98)",
              color: "#e6f1ff",
              border: "1px solid rgba(120, 180, 255, 0.25)",
              borderRadius: 12,
              boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
              padding: 20,
            }}
          >
            <h2
              id="signout-title"
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 0.4,
              }}
            >
              Sign out?
            </h2>
            <p
              id="signout-desc"
              style={{
                margin: "8px 0 18px",
                fontSize: 13,
                lineHeight: 1.5,
                color: "#a9c2e6",
              }}
            >
              You'll be returned to the login page. Any unsaved edits are
              autosaved, but the editor session will close.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                style={{
                  background: "transparent",
                  color: "#e6f1ff",
                  border: "1px solid #3a414d",
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  logout();
                }}
                style={{
                  background: "linear-gradient(180deg, #c44a4a 0%, #7f1414 100%)",
                  color: "#ffffff",
                  border: "1px solid rgba(255,180,180,0.4)",
                  padding: "8px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  cursor: "pointer",
                  boxShadow: "0 6px 16px rgba(127, 20, 20, 0.45)",
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
      {signingOut && (
        <div
          role="alertdialog"
          aria-busy="true"
          aria-live="assertive"
          aria-label="Signing out"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            background: "rgba(8, 18, 36, 0.65)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            color: "#e6f1ff",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            cursor: "wait",
          }}
          // Block keyboard interaction with the page below.
          onKeyDownCapture={(e) => e.preventDefault()}
        >
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "3px solid rgba(230, 241, 255, 0.25)",
              borderTopColor: "#e6f1ff",
              animation: "letterer-spin 0.8s linear infinite",
            }}
          />
          <span style={{ fontSize: 13, letterSpacing: 1, fontWeight: 600 }}>
            Signing out…
          </span>
          <style>{`@keyframes letterer-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <AmbientShips />
      <ConsoleScreen
        tint="cyan"
        label="SYS"
        width={14}
        rows={3}
        intervalMs={520}
        style={{
          position: "fixed",
          right: 12,
          bottom: 12,
          width: 120,
          zIndex: 1500,
          opacity: 0.55,
        }}
      />
      <ProjectManager />
      <LetteringTips />
      <div
        id="letterer-root"
        dangerouslySetInnerHTML={{ __html: bodyHtml as string }}
      />
    </>
  );
}

/** Reads the active theme from <html> class, with prefers-color-scheme as
 * fallback, and updates live when either changes. SSR-safe (returns "dark"). */
function useTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const root = document.documentElement;
    const compute = (): "dark" | "light" => {
      if (root.classList.contains("dark")) return "dark";
      if (root.classList.contains("light")) return "light";
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    };
    setTheme(compute());
    const mo = new MutationObserver(() => setTheme(compute()));
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMq = () => setTheme(compute());
    mq.addEventListener("change", onMq);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", onMq);
    };
  }, []);
  return theme;
}

type HoloPalette = {
  /** rgb triplet for the bright core (dot fill, beam highlight). */
  core: string;
  /** rgb triplet for the surrounding glow (shadows, beam wash). */
  glow: string;
  /** Three-stop colors for the radial-gradient base. */
  base1: string;
  base2: string;
  base3: string;
  /** rgba border on the emitter base. */
  border: string;
};

const HOLO_PALETTES: Record<"dark" | "light", HoloPalette> = {
  dark: {
    core: "180,230,255",
    glow: "120,200,255",
    base1: "#9ad6ff",
    base2: "#3a8fd1",
    base3: "#0a2540",
    border: "rgba(150,220,255,0.6)",
  },
  light: {
    core: "255,235,200",
    glow: "120,90,210",
    base1: "#fff4d6",
    base2: "#a07ad8",
    base3: "#3b1f6b",
    border: "rgba(120,90,210,0.55)",
  },
};

type PulseKind = "save" | "export" | "parse" | "balloon" | "autosave";

const PULSE_TINTS: Record<PulseKind, { glow: string; core: string; label: string }> = {
  save:     { glow: "255,180,80",  core: "255,230,170", label: "SAVED" },
  export:   { glow: "120,230,140", core: "210,255,220", label: "EXPORTED" },
  parse:    { glow: "230,110,220", core: "255,200,250", label: "PARSED" },
  balloon:  { glow: "120,200,255", core: "210,240,255", label: "BALLOON" },
  autosave: { glow: "255,200,120", core: "255,235,200", label: "AUTOSAVED" },
};

function HologramEmitter({ glow = 1, speed = 1 }: { glow?: number; speed?: number }) {
  const theme = useTheme();
  const basePalette = HOLO_PALETTES[theme];
  const [pulse, setPulse] = useState<{ kind: PulseKind; strength: number; id: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let nextId = 1;
    function onPulse(e: Event) {
      const detail = (e as CustomEvent).detail as { kind?: PulseKind; strength?: number } | undefined;
      const kind = (detail?.kind ?? "balloon") as PulseKind;
      const strength = Math.max(0, Math.min(1, detail?.strength ?? 0.6));
      setPulse({ kind, strength, id: nextId++ });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPulse(null), 1100);
    }
    window.addEventListener("holo:pulse", onPulse);
    return () => {
      window.removeEventListener("holo:pulse", onPulse);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Tint overrides palette glow/core during a pulse.
  const tint = pulse ? PULSE_TINTS[pulse.kind] : null;
  const p = tint
    ? { ...basePalette, glow: tint.glow, core: tint.core }
    : basePalette;
  // Effective glow/speed: user sliders are baseline, pulses overshoot.
  const pulseStrength = pulse?.strength ?? 0;
  const effGlow = glow + pulseStrength * 1.5;
  const effSpeed = speed * (1 + pulseStrength * 2.5);

  // 12 floating dots with deterministic positions/delays so SSR + CSR match.
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const radius = 26 + (i % 3) * 8;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const delay = (i * 0.35).toFixed(2);
    const dur = (4 + (i % 4)).toFixed(2);
    return { x, y, delay, dur, i };
  });
  // Beam rotation duration scales inversely with the speed multiplier.
  const beamDur = (6 / Math.max(0.05, effSpeed)).toFixed(3);
  // Helper to multiply alpha values by glow.
  const a = (base: number) => Math.min(1, Math.max(0, base * effGlow));
  // Multiply blur/spread by glow too so the halo grows with intensity.
  const s = (base: number) => Math.max(0, base * effGlow);

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        width: 120,
        height: 160,
        zIndex: 1500,
        pointerEvents: "none",
      }}
    >
      <style>{`
        @keyframes holo-beam-rotate { to { transform: translateX(-50%) rotate(360deg); } }
        @keyframes holo-beam-flicker {
          0%, 100% { opacity: ${(0.55 * effGlow).toFixed(3)}; }
          50%      { opacity: ${Math.min(1, 0.85 * effGlow).toFixed(3)}; }
        }
        @keyframes holo-base-pulse-dyn {
          0%, 100% { box-shadow: 0 0 ${s(14)}px ${s(2)}px rgba(${p.glow},${a(0.55).toFixed(3)}), 0 0 ${s(28)}px ${s(6)}px rgba(${p.glow},${a(0.25).toFixed(3)}); }
          50%      { box-shadow: 0 0 ${s(22)}px ${s(4)}px rgba(${p.core},${a(0.85).toFixed(3)}), 0 0 ${s(44)}px ${s(10)}px rgba(${p.glow},${a(0.4).toFixed(3)}); }
        }
        @keyframes holo-dot-orbit {
          0%   { transform: translate(0,0) scale(1);   opacity: 0; }
          15%  { opacity: 1; }
          50%  { transform: translate(var(--dx), calc(var(--dy) - 40px)) scale(1.2); opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate(0, -90px) scale(0.6); opacity: 0; }
        }
        @keyframes holo-shockwave-expand {
          0%   { transform: translateX(-50%) scale(0.4); opacity: 0.95; }
          100% { transform: translateX(-50%) scale(4);   opacity: 0;    }
        }
        @keyframes holo-chip-flash {
          0%   { transform: translateX(-50%) translateY(6px); opacity: 0; }
          15%  { transform: translateX(-50%) translateY(0);   opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateX(-50%) translateY(-8px); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .holo-beam, .holo-base, .holo-dot, .holo-shockwave, .holo-chip { animation: none !important; }
          .holo-shockwave { display: none !important; }
        }
      `}</style>

      {/* Beam */}
      <div
        className="holo-beam"
        style={{
          position: "absolute",
          left: "50%",
          bottom: 18,
          width: 70,
          height: 130,
          transform: "translateX(-50%)",
          transformOrigin: "50% 100%",
          background: `conic-gradient(from 0deg, rgba(${p.glow},0) 0deg, rgba(${p.glow},0.55) 30deg, rgba(${p.core},0.15) 60deg, rgba(${p.glow},0) 120deg, rgba(${p.glow},0) 360deg)`,
          clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)",
          filter: "blur(1px)",
          animation: `holo-beam-rotate ${beamDur}s linear infinite, holo-beam-flicker 2.4s ease-in-out infinite`,
          mixBlendMode: theme === "dark" ? "screen" : "multiply",
        }}
      />

      {/* Floating dots */}
      {dots.map((d) => (
        <span
          key={d.i}
          className="holo-dot"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 22,
            width: 4,
            height: 4,
            marginLeft: -2,
            borderRadius: "50%",
            background: `rgba(${p.core},${a(0.95).toFixed(3)})`,
            boxShadow: `0 0 ${s(6)}px ${s(2)}px rgba(${p.glow},${a(0.7).toFixed(3)})`,
            ["--dx" as string]: `${d.x}px`,
            ["--dy" as string]: `${d.y}px`,
            animation: `holo-dot-orbit ${d.dur}s ease-in-out ${d.delay}s infinite`,
          }}
        />
      ))}

      {/* Emitter base */}
      <div
        className="holo-base"
        style={{
          position: "absolute",
          left: "50%",
          bottom: 6,
          width: 44,
          height: 14,
          transform: "translateX(-50%)",
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${p.base1} 0%, ${p.base2} 55%, ${p.base3} 100%)`,
          border: `1px solid ${p.border}`,
          animation: "holo-base-pulse-dyn 2.8s ease-in-out infinite",
        }}
      />

      {/* Expanding shockwave ring + label chip on each pulse. Keyed by id
          so each pulse remounts and the animation replays cleanly. */}
      {pulse && tint && (
        <span
          key={`sw-${pulse.id}`}
          className="holo-shockwave"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 6,
            width: 14,
            height: 14,
            marginLeft: -7,
            borderRadius: "50%",
            border: `2px solid rgba(${tint.glow},0.85)`,
            boxShadow: `0 0 12px 2px rgba(${tint.glow},0.55)`,
            transformOrigin: "50% 50%",
            animation: "holo-shockwave-expand 1000ms ease-out forwards",
            pointerEvents: "none",
          }}
        />
      )}
      {pulse && tint && (
        <span
          key={`chip-${pulse.id}`}
          className="holo-chip"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: 4,
            transform: "translateX(-50%)",
            padding: "2px 8px",
            borderRadius: 999,
            background: `rgba(${tint.glow},0.18)`,
            border: `1px solid rgba(${tint.glow},0.7)`,
            color: `rgb(${tint.core})`,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 9,
            letterSpacing: 1.2,
            fontWeight: 700,
            whiteSpace: "nowrap",
            textShadow: `0 0 6px rgba(${tint.glow},0.8)`,
            animation: "holo-chip-flash 1100ms ease-out forwards",
          }}
        >
          {tint.label}
        </span>
      )}
    </div>
  );
}

type HologramControlsProps = {
  glow: number;
  speed: number;
  open: boolean;
  onGlow: (n: number) => void;
  onSpeed: (n: number) => void;
  onToggle: () => void;
  onReset: () => void;
};

function HologramControls({
  glow,
  speed,
  open,
  onGlow,
  onSpeed,
  onToggle,
  onReset,
}: HologramControlsProps) {
  const theme = useTheme();
  const fmt = (n: number) => `${n.toFixed(2)}×`;
  const isDark = theme === "dark";
  const surface = {
    bg: isDark ? "rgba(20, 26, 38, 0.85)" : "rgba(255, 255, 255, 0.88)",
    fg: isDark ? "#e6f1ff" : "#1a1d23",
    muted: isDark ? "#a9c2e6" : "#5a6478",
    border: isDark ? "rgba(120, 180, 255, 0.3)" : "rgba(120, 90, 210, 0.35)",
    shadow: isDark ? "0 8px 24px rgba(0,0,0,0.45)" : "0 8px 24px rgba(60,30,120,0.18)",
    accent: isDark ? "#7ec1ff" : "#7855d6",
  };
  const panelBase: React.CSSProperties = {
    position: "fixed",
    left: 16,
    bottom: 188,
    zIndex: 1600,
    pointerEvents: "auto",
    background: surface.bg,
    color: surface.fg,
    border: `1px solid ${surface.border}`,
    borderRadius: 10,
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    boxShadow: surface.shadow,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 11,
    letterSpacing: 0.3,
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label="Show hologram controls"
        title="Hologram controls"
        style={{
          ...panelBase,
          padding: "6px 10px",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        ◐ Holo
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label="Hologram controls"
      style={{ ...panelBase, padding: "10px 12px", width: 200 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 700, letterSpacing: 0.6 }}>HOLOGRAM</span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hide hologram controls"
          title="Collapse"
          style={{
            background: "transparent",
            color: surface.muted,
            border: 0,
            cursor: "pointer",
            padding: 2,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ▾
        </button>
      </div>

      <label htmlFor="holo-glow" style={{ display: "block", marginBottom: 2 }}>
        <span style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Glow</span>
          <span style={{ color: surface.muted }}>{fmt(glow)}</span>
        </span>
      </label>
      <input
        id="holo-glow"
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={glow}
        onChange={(e) => onGlow(Number.parseFloat(e.target.value))}
        aria-valuetext={fmt(glow)}
        style={{ width: "100%", accentColor: surface.accent, marginBottom: 8 }}
      />

      <label htmlFor="holo-speed" style={{ display: "block", marginBottom: 2 }}>
        <span style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Speed</span>
          <span style={{ color: surface.muted }}>{fmt(speed)}</span>
        </span>
      </label>
      <input
        id="holo-speed"
        type="range"
        min={0.2}
        max={4}
        step={0.1}
        value={speed}
        onChange={(e) => onSpeed(Number.parseFloat(e.target.value))}
        aria-valuetext={fmt(speed)}
        title="Beam rotation speed (no effect with reduced motion)"
        style={{ width: "100%", accentColor: surface.accent, marginBottom: 8 }}
      />

      <button
        type="button"
        onClick={onReset}
        style={{
          background: "transparent",
          color: surface.muted,
          border: `1px solid ${surface.border}`,
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 11,
          cursor: "pointer",
          width: "100%",
        }}
      >
        Reset
      </button>
    </div>
  );
}

function AmbientShips() {
  // Fixed full-viewport layer; sits behind the editor chrome which uses
  // higher z-indexes in letterer.css. Faint so it doesn't distract.
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <Ships count={3} faint />
    </div>
  );
}
