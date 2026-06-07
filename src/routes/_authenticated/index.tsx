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
