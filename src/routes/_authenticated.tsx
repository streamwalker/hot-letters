import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_PROJECT_REF = (import.meta as { env?: Record<string, string> }).env
  ?.VITE_SUPABASE_PROJECT_ID;

/**
 * Server-side: check for the Supabase auth cookie. If it's missing we
 * fail closed and bounce to /login instead of letting SSR render the
 * protected shell. We can't decode/verify the JWT without bundling the
 * service-role key into SSR, so the client still re-validates the session.
 *
 * Client-side: do the real getSession() check the same way as before.
 */
async function checkAuth(location: { href: string }) {
  if (typeof window === "undefined") {
    // Lazy import — these utilities only resolve on the server bundle.
    const { getCookie } = await import("@tanstack/react-start/server");

    const cookieNames = [
      SUPABASE_PROJECT_REF ? `sb-${SUPABASE_PROJECT_REF}-auth-token` : null,
      "sb-access-token",
      "supabase-auth-token",
    ].filter(Boolean) as string[];

    const hasAuthCookie = cookieNames.some((name) => {
      try {
        return Boolean(getCookie(name));
      } catch {
        return false;
      }
    });

    if (!hasAuthCookie) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw redirect({
      to: "/login",
      search: { redirect: location.href },
    });
  }
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    await checkAuth({ href: location.href });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setReady(true);
      } else {
        window.location.assign("/login");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) window.location.assign("/login");
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ready) return null;
  return <Outlet />;
}
