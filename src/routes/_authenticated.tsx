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
      throw redirect({ to: "/login", search: { redirect: href } });
    }
  })
  .client(async (href: string) => {
    const { data } = await supabase.auth.getSession();
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
