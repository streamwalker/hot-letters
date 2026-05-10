import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
      <div
        id="letterer-root"
        dangerouslySetInnerHTML={{ __html: bodyHtml as string }}
      />
    </>
  );
}
