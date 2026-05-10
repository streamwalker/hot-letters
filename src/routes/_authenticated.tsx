import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_PROJECT_REF = (import.meta as { env?: Record<string, string> }).env
  ?.VITE_SUPABASE_PROJECT_ID;

/**
 * Isomorphic auth gate.
 * - Server: check for a Supabase auth cookie. If absent, redirect to /login.
 * - Client: check supabase.auth.getSession() (localStorage-backed).
 */
const checkAuth = createIsomorphicFn()
  .server(async (href: string) => {
    const { getCookie, getCookies, getRequestHeader } = await import(
      "@tanstack/react-start/server"
    );

    // 1. Known cookie names (project-specific + legacy fallbacks).
    const knownNames = [
      SUPABASE_PROJECT_REF ? `sb-${SUPABASE_PROJECT_REF}-auth-token` : null,
      "sb-access-token",
      "sb-refresh-token",
      "supabase-auth-token",
      "supabase.auth.token",
    ].filter(Boolean) as string[];

    const found: string[] = [];
    for (const name of knownNames) {
      try {
        if (getCookie(name)) found.push(name);
      } catch {
        /* ignore */
      }
    }

    // 2. Pattern fallback: any `sb-*-auth-token(.N)?` cookie (chunked cookies
    //    from supabase-js v2 use `.0`, `.1` suffixes; refs differ across envs).
    const sbPattern = /^sb-[^=;]+-auth-token(?:\.\d+)?$/;
    let allCookies: Record<string, string> = {};
    try {
      allCookies = getCookies() ?? {};
    } catch {
      // Some adapters don't expose getCookies — fall back to parsing the header.
      try {
        const header = getRequestHeader("cookie") ?? "";
        for (const part of header.split(/;\s*/)) {
          const eq = part.indexOf("=");
          if (eq > 0) allCookies[part.slice(0, eq)] = part.slice(eq + 1);
        }
      } catch {
        /* ignore */
      }
    }
    for (const name of Object.keys(allCookies)) {
      if (sbPattern.test(name) && !found.includes(name)) found.push(name);
    }

    const hasAuthCookie = found.length > 0;

    console.log(
      `[auth/ssr] checkAuth href=${href} known=${knownNames.join(",")} found=${
        found.join(",") || "none"
      } totalCookies=${Object.keys(allCookies).length} -> ${
        hasAuthCookie ? "allow" : "redirect:/login"
      }`,
    );

    if (!hasAuthCookie) {
      throw redirect({ to: "/login", search: { redirect: href } });
    }
  })
  .client(async (href: string) => {
    const { data } = await supabase.auth.getSession();
    console.log(
      `[auth/client] checkAuth href=${href} session=${
        data.session ? `user:${data.session.user.id}` : "none"
      } -> ${data.session ? "allow" : "redirect:/login"}`,
    );
    if (!data.session) {
      throw redirect({ to: "/login", search: { redirect: href } });
    }
  });

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    await checkAuth(location.href);
  },
  component: AuthLayout,
});

function AuthLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const goToLogin = () => {
      const here = window.location.pathname + window.location.search + window.location.hash;
      const target = here && here !== "/login" ? here : "/";
      window.location.assign(`/login?redirect=${encodeURIComponent(target)}`);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      console.log(
        `[auth/layout] initial getSession -> ${
          data.session ? `ready user:${data.session.user.id}` : "no session, redirecting /login"
        }`,
      );
      if (data.session) {
        setReady(true);
      } else {
        goToLogin();
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(
        `[auth/layout] onAuthStateChange event=${event} session=${
          session ? `user:${session.user.id}` : "none"
        }`,
      );
      if (!session) goToLogin();
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ready) return null;
  return <Outlet />;
}
