import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import loginBg from "@/assets/login-bg.png";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Comic Book Letterer" }] }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setInfo("Check your email to confirm your account, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundImage: `url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        color: "#e6f1ff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "min(6vw, 80px)",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "rgba(10, 22, 44, 0.55)",
          border: "1px solid rgba(120, 180, 255, 0.25)",
          borderRadius: 14,
          padding: "32px 32px 28px",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(120,180,255,0.08) inset",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            letterSpacing: 4,
            textAlign: "center",
            fontWeight: 700,
          }}
        >
          {mode === "signin" ? "LOG IN" : "SIGN UP"}
        </h1>
        <p
          style={{
            marginTop: 6,
            marginBottom: 22,
            fontSize: 13,
            color: "#a9c2e6",
            textAlign: "center",
          }}
        >
          {mode === "signin" ? "Continue your mission." : "Join the mission."}
        </p>

        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <input
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...inputStyle, marginTop: 12 }}
        />

        {error && (
          <p style={{ color: "#ff7a7a", fontSize: 12, marginTop: 12 }}>{error}</p>
        )}
        {info && <p style={{ color: "#7ec1ff", fontSize: 12, marginTop: 12 }}>{info}</p>}

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 20,
            width: "100%",
            padding: "14px 16px",
            background: "linear-gradient(180deg, #2a6fc4 0%, #14457f 100%)",
            color: "#ffffff",
            border: "1px solid rgba(120,180,255,0.4)",
            borderRadius: 8,
            fontWeight: 700,
            letterSpacing: 2,
            cursor: "pointer",
            opacity: busy ? 0.6 : 1,
            boxShadow: "0 6px 20px rgba(20, 69, 127, 0.5)",
          }}
        >
          {busy
            ? "PLEASE WAIT…"
            : mode === "signin"
              ? "ENTER DASHBOARD →"
              : "CREATE ACCOUNT →"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          style={{
            marginTop: 12,
            width: "100%",
            background: "transparent",
            color: "#a9c2e6",
            border: 0,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  background: "rgba(8, 18, 36, 0.7)",
  color: "#e6f1ff",
  border: "1px solid rgba(120, 180, 255, 0.3)",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};
