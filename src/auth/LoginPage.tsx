import { useState } from "react";
import { useSignIn, useSignUp } from "@clerk/clerk-react";
import { signInWithProvider } from "./browserOauth";
import "./login.css";

type Mode = "sign-in" | "sign-up" | "verify" | "reset" | "reset-code";

const firstError = (err: unknown): string => {
  const e = err as { errors?: { message?: string }[]; message?: string };
  return e?.errors?.[0]?.message ?? e?.message ?? "Something went wrong. Please try again.";
};

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.4-.2-2H12v3.8h5.9c-.1 1-.8 2.5-2.3 3.5l3.4 2.6c2-1.9 3.5-4.6 3.5-7.9z"/>
      <path fill="#34A853" d="M12 23c3.1 0 5.7-1 7.6-2.8l-3.4-2.6c-.9.6-2.1 1-4.2 1-3.2 0-5.9-2.1-6.9-5l-3.5 2.7C3.5 20.4 7.4 23 12 23z"/>
      <path fill="#FBBC05" d="M5.1 13.6c-.2-.6-.4-1.3-.4-2s.1-1.4.4-2L1.6 6.9C.9 8.4.5 10.1.5 11.6s.4 3.2 1.1 4.7l3.5-2.7z"/>
      <path fill="#EA4335" d="M12 4.6c1.8 0 3 .8 3.6 1.4l2.7-2.6C16.6 1.8 14.4.9 12 .9 7.4.9 3.5 3.5 1.6 6.9l3.5 2.7c1-2.9 3.7-5 6.9-5z"/>
    </svg>
  );
}
function GithubGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/>
    </svg>
  );
}

export function LoginPage() {
  const { isLoaded: siLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: suLoaded, signUp, setActive: setSignUpActive } = useSignUp();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!siLoaded || !suLoaded) return null;

  const oauth = async (provider: "google" | "github") => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      // Opens the system browser; returns once the loopback hands back a sign-in token.
      await signInWithProvider(provider, signIn, setSignInActive);
    } catch (err) {
      setError(firstError(err));
    } finally {
      setBusy(false);
    }
  };

  const doSignIn = async () => {
    const res = await signIn.create({ strategy: "password", identifier: email, password });
    if (res.status === "complete") {
      // setActive flips Clerk to signed-in; the <SignedIn> gate in App swaps to the app.
      await setSignInActive({ session: res.createdSessionId });
    } else {
      setError("Additional verification is required. Use 'Manage account' after signing in.");
    }
  };

  const doSignUp = async () => {
    if (signUp.status !== "missing_requirements") {
      await signUp.create({ emailAddress: email, password });
    }
    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    setMode("verify");
  };

  const doVerify = async () => {
    const res = await signUp.attemptEmailAddressVerification({ code });
    if (res.status === "complete") {
      await setSignUpActive({ session: res.createdSessionId });
    } else {
      setError("That code didn't work. Check your email and try again.");
    }
  };

  const doReset = async () => {
    await signIn.create({ strategy: "reset_password_email_code", identifier: email });
    setNotice("We've emailed you a reset code. Enter it below with a new password.");
    setMode("reset-code");
  };

  const doResetCode = async () => {
    const res = await signIn.attemptFirstFactor({
      strategy: "reset_password_email_code",
      code,
      password,
    });
    if (res.status === "complete") {
      await setSignInActive({ session: res.createdSessionId });
    } else {
      setError("Couldn't reset your password. Check the code and try again.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "sign-in") await doSignIn();
      else if (mode === "sign-up") await doSignUp();
      else if (mode === "verify") await doVerify();
      else if (mode === "reset") await doReset();
      else if (mode === "reset-code") await doResetCode();
    } catch (err) {
      setError(firstError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1 className="login-brand">Vibe Space</h1>
        <p className="login-tagline">
          {mode === "sign-up" ? "Create your account."
            : mode === "verify" ? "Check your email for a code."
            : mode === "reset" ? "Reset your password."
            : mode === "reset-code" ? "Enter your reset code and a new password."
            : "Sign in to your canvas."}
        </p>

        {(mode === "sign-in" || mode === "sign-up") && (
          <>
            <div className="login-oauth">
              <button type="button" className="login-oauth-btn" disabled={busy} onClick={() => void oauth("google")}>
                <GoogleGlyph /> Continue with Google
              </button>
              <button type="button" className="login-oauth-btn" disabled={busy} onClick={() => void oauth("github")}>
                <GithubGlyph /> Continue with GitHub
              </button>
            </div>
            <div className="login-divider">or</div>
          </>
        )}

        {(mode === "verify" || mode === "reset-code") && (
          <div className="login-field">
            <label htmlFor="code">{mode === "reset-code" ? "Reset code" : "Verification code"}</label>
            <input id="code" className="login-input" type="text" inputMode="numeric" autoComplete="one-time-code"
              value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
          </div>
        )}
        {(mode === "sign-in" || mode === "sign-up" || mode === "reset") && (
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input id="email" className="login-input" type="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        )}
        {(mode === "sign-in" || mode === "sign-up" || mode === "reset-code") && (
          <div className="login-field">
            <label htmlFor="password">{mode === "reset-code" ? "New password" : "Password"}</label>
            <input id="password" className="login-input" type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}

        <p className="login-error" aria-live="assertive">{error}</p>
        <p className="login-notice" aria-live="polite">{notice}</p>

        <button className="login-submit" type="submit" disabled={busy}>
          {busy ? "Please wait…"
            : mode === "sign-up" ? "Create account"
            : mode === "verify" ? "Verify email"
            : mode === "reset" ? "Send reset code"
            : mode === "reset-code" ? "Reset password"
            : "Sign in"}
        </button>

        <div className="login-foot">
          {mode === "sign-in" && (
            <>
              <button type="button" className="login-link" onClick={() => { setError(""); setNotice(""); setMode("reset"); }}>
                Forgot password?
              </button>
              {" · "}
              <button type="button" className="login-link" onClick={() => { setError(""); setNotice(""); setMode("sign-up"); }}>
                Create an account
              </button>
            </>
          )}
          {(mode === "sign-up" || mode === "reset" || mode === "verify" || mode === "reset-code") && (
            <button type="button" className="login-link" onClick={() => { setError(""); setNotice(""); setMode("sign-in"); }}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
