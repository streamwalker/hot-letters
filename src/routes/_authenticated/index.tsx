import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Ships, ConsoleScreen } from "@/components/scene-motion";
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

    let userId: string | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let loaded = false;

    async function init() {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      userId = u.user.id;

      // Load existing project
      const { data, error } = await supabase
        .from("projects")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();
      if (!error && data?.data && window.__letterer) {
        try {
          window.__letterer.load(data.data);
        } catch (e) {
          console.error("Failed to load project", e);
        }
      }
      loaded = true;
    }

    function scheduleSave() {
      if (!loaded || !userId || !window.__letterer) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try {
          const payload = window.__letterer!.serialize();
          await supabase
            .from("projects")
            .upsert(
              { user_id: userId!, data: payload as never, updated_at: new Date().toISOString() },
              { onConflict: "user_id" },
            );
        } catch (e) {
          console.error("Autosave failed", e);
        }
      }, 1200);
    }

    window.addEventListener("letterer:change", scheduleSave);
    init();

    return () => {
      window.removeEventListener("letterer:change", scheduleSave);
      if (saveTimer) clearTimeout(saveTimer);
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
      <HologramEmitter />
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
      <div
        id="letterer-root"
        dangerouslySetInnerHTML={{ __html: bodyHtml as string }}
      />
    </>
  );
}

function HologramEmitter() {
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
        @keyframes holo-base-pulse {
          0%, 100% { box-shadow: 0 0 14px 2px rgba(120,200,255,0.55), 0 0 28px 6px rgba(120,200,255,0.25); }
          50%      { box-shadow: 0 0 22px 4px rgba(150,220,255,0.85), 0 0 44px 10px rgba(120,200,255,0.4); }
        }
        @keyframes holo-beam-flicker {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }
        @keyframes holo-dot-orbit {
          0%   { transform: translate(0,0) scale(1);   opacity: 0; }
          15%  { opacity: 1; }
          50%  { transform: translate(var(--dx), calc(var(--dy) - 40px)) scale(1.2); opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate(0, -90px) scale(0.6); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .holo-beam, .holo-base, .holo-dot { animation: none !important; }
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
          background:
            "conic-gradient(from 0deg, rgba(120,200,255,0) 0deg, rgba(120,200,255,0.55) 30deg, rgba(180,230,255,0.15) 60deg, rgba(120,200,255,0) 120deg, rgba(120,200,255,0) 360deg)",
          clipPath: "polygon(50% 100%, 0% 0%, 100% 0%)",
          filter: "blur(1px)",
          animation:
            "holo-beam-rotate 6s linear infinite, holo-beam-flicker 2.4s ease-in-out infinite",
          mixBlendMode: "screen",
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
            background: "rgba(180,230,255,0.95)",
            boxShadow: "0 0 6px 2px rgba(120,200,255,0.7)",
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
          background:
            "radial-gradient(ellipse at center, #9ad6ff 0%, #3a8fd1 55%, #0a2540 100%)",
          border: "1px solid rgba(150,220,255,0.6)",
          animation: "holo-base-pulse 2.8s ease-in-out infinite",
        }}
      />
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
