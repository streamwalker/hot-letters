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
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
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
        backgroundPosition: isMobile ? "70% center" : "center",
        backgroundRepeat: "no-repeat",
        backgroundColor: "#04101f",
        color: "#e6f1ff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
        display: isMobile ? "flex" : "block",
        flexDirection: isMobile ? "column" : undefined,
        alignItems: isMobile ? "center" : undefined,
        padding: isMobile ? "24px 18px 32px" : 0,
        boxSizing: "border-box",
      }}
    >
      {isMobile && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(4,16,31,0.55) 0%, rgba(4,16,31,0.85) 60%, rgba(4,16,31,0.95) 100%)",
            zIndex: 1,
          }}
        />
      )}

      {/* Hot Letters logo */}
      <img
        src={hotLettersLogo}
        alt="Hot Letters"
        width={1536}
        height={1024}
        style={
          isMobile
            ? {
                position: "relative",
                width: "min(260px, 70vw)",
                height: "auto",
                marginTop: 8,
                marginBottom: 24,
                filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.6))",
                pointerEvents: "none",
                zIndex: 2,
              }
            : {
                position: "absolute",
                top: "3vh",
                left: "3vw",
                width: "min(280px, 22vw)",
                height: "auto",
                filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.6))",
                pointerEvents: "none",
                zIndex: 2,
              }
        }
      />

      {/* Form: anchored to the baked-in card on desktop, centered on mobile */}
      <form
        onSubmit={submit}
        style={
          isMobile
            ? {
                position: "relative",
                width: "100%",
                maxWidth: 380,
                padding: "22px 20px 24px",
                background: "rgba(8, 18, 36, 0.78)",
                border: "1px solid rgba(120, 180, 255, 0.25)",
                borderRadius: 14,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                boxShadow: "0 16px 50px rgba(0,0,0,0.55)",
                zIndex: 2,
              }
            : {
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
              }
        }
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

        <label htmlFor="login-email" style={srOnly}>
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="Email"
          aria-label="Email"
          className="login-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={getInputStyle(isMobile)}
        />

        <label htmlFor="login-password" style={srOnly}>
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Password"
          aria-label="Password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ ...getInputStyle(isMobile), marginTop: isMobile ? 14 : 10 }}
        />

        {error && (
          <p style={{ color: "#ff7a7a", fontSize: isMobile ? 14 : 12, marginTop: 12 }}>{error}</p>
        )}
        {info && (
          <p style={{ color: "#7ec1ff", fontSize: isMobile ? 14 : 12, marginTop: 12 }}>{info}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          style={{
            marginTop: isMobile ? 20 : 16,
            width: "100%",
            minHeight: isMobile ? 52 : 44,
            padding: isMobile ? "16px 18px" : "12px 16px",
            background: "linear-gradient(180deg, #2a6fc4 0%, #14457f 100%)",
            color: "#ffffff",
            border: "1px solid rgba(120,180,255,0.4)",
            borderRadius: 10,
            fontWeight: 700,
            letterSpacing: 2,
            fontSize: isMobile ? 15 : 13,
            cursor: busy ? "not-allowed" : "pointer",
            touchAction: "manipulation",
            opacity: busy ? 0.7 : 1,
            boxShadow: "0 6px 20px rgba(20, 69, 127, 0.5)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {busy && (
            <span
              className="login-spinner"
              aria-hidden="true"
              style={{
                width: isMobile ? 18 : 14,
                height: isMobile ? 18 : 14,
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.35)",
                borderTopColor: "#ffffff",
                display: "inline-block",
              }}
            />
          )}
          <span>
            {busy
              ? mode === "signin"
                ? "SIGNING IN…"
                : "CREATING ACCOUNT…"
              : mode === "signin"
                ? "ENTER DASHBOARD →"
                : "CREATE ACCOUNT →"}
          </span>
          <span
            role="status"
            aria-live="polite"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
            }}
          >
            {busy ? "Submitting, please wait" : ""}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setInfo(null);
          }}
          style={{
            marginTop: isMobile ? 14 : 10,
            width: "100%",
            minHeight: isMobile ? 44 : 32,
            padding: isMobile ? "10px 12px" : "6px 8px",
            background: "transparent",
            color: "#a9c2e6",
            border: 0,
            cursor: "pointer",
            touchAction: "manipulation",
            fontSize: isMobile ? 14 : 12,
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

function getInputStyle(isMobile: boolean): React.CSSProperties {
  return {
    width: "100%",
    minHeight: isMobile ? 52 : 40,
    // 16px font on mobile prevents iOS Safari from auto-zooming on focus
    fontSize: isMobile ? 16 : 13,
    padding: isMobile ? "14px 16px" : "10px 12px",
    background: "rgba(8, 18, 36, 0.7)",
    color: "#e6f1ff",
    border: "1px solid rgba(120, 180, 255, 0.3)",
    borderRadius: 10,
    fontFamily: "inherit",
    boxSizing: "border-box",
    outline: "none",
  };
}

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};
