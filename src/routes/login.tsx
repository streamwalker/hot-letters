import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import loginBg from "@/assets/login-bg.png";
import hotLettersLogo from "@/assets/hot-letters-logo.png";

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
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        backgroundImage: `url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        color: "#e6f1ff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Hot Letters logo, top-left */}
      <img
        src={hotLettersLogo}
        alt="Hot Letters"
        width={1536}
        height={1024}
        style={{
          position: "absolute",
          top: "3vh",
          left: "3vw",
          width: "min(280px, 22vw)",
          height: "auto",
          filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.6))",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Form aligned over the baked-in LOG IN area on the right
          card, leaving the Astralnaut Studios crest + wordmark above
          fully visible. */}
      <form
        onSubmit={submit}
        style={{
          position: "absolute",
          top: "52%",
          right: "4.5%",
          width: "min(360px, 30vw)",
          padding: "20px 22px 22px",
          background: "rgba(8, 18, 36, 0.55)",
          border: "1px solid rgba(120, 180, 255, 0.25)",
          borderRadius: 12,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          boxShadow: "0 16px 50px rgba(0,0,0,0.45)",
          zIndex: 2,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            letterSpacing: 4,
            textAlign: "center",
            fontWeight: 700,
          }}
        >
          {mode === "signin" ? "LOG IN" : "SIGN UP"}
        </h1>
        <p
          style={{
            marginTop: 4,
            marginBottom: 16,
            fontSize: 12,
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
          style={{ ...inputStyle, marginTop: 10 }}
        />

        {error && (
          <p style={{ color: "#ff7a7a", fontSize: 12, marginTop: 10 }}>{error}</p>
        )}
        {info && <p style={{ color: "#7ec1ff", fontSize: 12, marginTop: 10 }}>{info}</p>}

        <button
          type="submit"
          disabled={busy}
          style={{
            marginTop: 16,
            width: "100%",
            padding: "12px 16px",
            background: "linear-gradient(180deg, #2a6fc4 0%, #14457f 100%)",
            color: "#ffffff",
            border: "1px solid rgba(120,180,255,0.4)",
            borderRadius: 8,
            fontWeight: 700,
            letterSpacing: 2,
            fontSize: 13,
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
            marginTop: 10,
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
  padding: "10px 12px",
  background: "rgba(8, 18, 36, 0.7)",
  color: "#e6f1ff",
  border: "1px solid rgba(120, 180, 255, 0.3)",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};
