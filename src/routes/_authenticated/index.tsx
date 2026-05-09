import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
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
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <>
      <button
        onClick={logout}
        style={{
          position: "fixed",
          top: 8,
          right: 8,
          zIndex: 2000,
          background: "#2c313a",
          color: "#e6e9ef",
          border: "1px solid #3a414d",
          padding: "5px 10px",
          borderRadius: 5,
          fontSize: 12,
          cursor: "pointer",
        }}
        title="Sign out"
      >
        Log out
      </button>
      <div
        id="letterer-root"
        dangerouslySetInnerHTML={{ __html: bodyHtml as string }}
      />
    </>
  );
}
