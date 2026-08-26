import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { resetStartupRouting } from "@/lib/startup-routing";

type AuthMode = "signin" | "register" | "forgot";

function getMode(): AuthMode {
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "register" || mode === "forgot") return mode;
  return "signin";
}

function getInitialError(): string {
  return new URLSearchParams(window.location.search).get("error") ===
    "legacy-account-migration"
    ? "This Emmaus profile needs a secure migration before email and password can be used. Please contact your Emmaus administrator."
    : "";
}

export default function Auth() {
  const [, setLocation] = useLocation();
  const {
    signIn,
    signUp,
    resendConfirmationEmail,
    sendPasswordReset,
    user,
    loading,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>(getMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(getInitialError);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Auth can be reached after a previous account's startup guard was
    // completed. Reset it before sending members through Welcome so the new
    // session gets its Daily Rhythm first-open decision.
    if (user.role !== "admin" && user.role !== "superAdmin") {
      resetStartupRouting();
    }
    setLocation(
      user.role === "admin" || user.role === "superAdmin" ? "/admin" : "/",
    );
  }, [setLocation, user]);

  const changeMode = (next: AuthMode) => {
    setError("");
    setNotice("");
    setPassword("");
    setMode(next);
    const suffix = next === "signin" ? "" : `?mode=${next}`;
    window.history.replaceState(null, "", `${window.location.pathname}${suffix}`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else if (mode === "register") {
        await signUp(email, password);
        setNotice(
          "Check your inbox to verify your email, then return here to sign in.",
        );
      } else {
        await sendPasswordReset(email);
        setNotice(
          "If an Emmaus account uses this email, password reset instructions are on the way.",
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We could not complete that account request.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    mode === "register"
      ? "Begin your journey"
      : mode === "forgot"
        ? "Reset your password"
        : "Welcome back";
  const description =
    mode === "register"
      ? "Create an Emmaus account to save your progress."
      : mode === "forgot"
        ? "We will send a secure link to reset your password."
        : "Sign in to continue walking.";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background px-6 py-6 relative">
      <button
        onClick={() => {
          if (mode !== "signin") changeMode("signin");
          else if (window.history.length > 1) window.history.back();
          else setLocation("/");
        }}
        className="absolute top-6 left-6 p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Back to welcome"
        data-testid="button-back"
      >
        <ArrowLeft size={22} />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 flex items-center justify-center"
      >
        <div className="w-full max-w-[400px]">
          <div className="space-y-3 text-center mb-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              {mode === "forgot" ? (
                <KeyRound size={27} aria-hidden="true" />
              ) : (
                <ShieldCheck size={28} aria-hidden="true" />
              )}
            </div>
            <h1 className="text-[32px] font-sans font-medium tracking-tight leading-tight">
              {title}
            </h1>
            <p className="text-base text-muted-foreground">{description}</p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 p-4 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20"
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="mb-5 p-4 bg-primary/10 text-foreground text-sm rounded-xl border border-primary/20"
            >
              {notice}
            </div>
          )}

          {mode === "register" && notice && (
            <button
              type="button"
              disabled={resending || submitting}
              onClick={async () => {
                setError("");
                setResending(true);
                try {
                  await resendConfirmationEmail(email);
                  setNotice("A new verification email was requested. If it does not arrive, the email provider may be blocking delivery.");
                } catch (reason) {
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : "We could not request another verification email.",
                  );
                } finally {
                  setResending(false);
                }
              }}
              className="mt-3 w-full text-sm text-foreground/70 hover:text-foreground underline underline-offset-2 min-h-[44px] disabled:opacity-50"
              data-testid="button-resend-confirmation"
            >
              {resending ? "Requesting another email…" : "Resend confirmation email"}
            </button>
          )}

          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <label htmlFor="auth-email" className="text-sm font-medium">
                Email address
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full h-12 rounded-xl border border-input bg-background pl-10 pr-3 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="you@example.com"
                  required
                  data-testid="input-auth-email"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div className="space-y-2">
                <label htmlFor="auth-password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  minLength={8}
                  maxLength={128}
                  required
                  data-testid="input-auth-password"
                />
                {mode === "register" && (
                  <p className="text-xs text-muted-foreground">
                    Use at least 8 characters.
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-base rounded-xl"
              disabled={loading || submitting}
              data-testid="button-auth-submit"
            >
              {submitting
                ? "Please wait…"
                : mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Sign in"}
            </Button>
          </form>

          {mode === "signin" && (
            <button
              type="button"
              onClick={() => changeMode("forgot")}
              className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 min-h-[44px]"
              data-testid="button-forgot-password"
            >
              Forgot your password?
            </button>
          )}

          <div className="text-center mt-4">
            <button
              type="button"
              onClick={() =>
                changeMode(mode === "register" ? "signin" : "register")
              }
              className="text-sm text-foreground/60 hover:text-foreground transition-colors underline underline-offset-2 min-h-[44px] px-4"
              data-testid="button-toggle-mode"
            >
              {mode === "register"
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}