import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

type CallbackState = "recovery" | "error";

type CallbackParams = {
  state: CallbackState;
  tokenHash: string | null;
  tokenType: "email" | "recovery" | null;
};

function parseCallback(): CallbackParams {
  const params = new URLSearchParams(window.location.search);
  const tokenType =
    params.get("type") === "email" || params.get("type") === "recovery"
      ? (params.get("type") as "email" | "recovery")
      : null;
  const tokenHash = params.get("token_hash");
  if (tokenHash && tokenType) {
    return { state: "error", tokenHash, tokenType };
  }
  return {
    state:
      params.get("mode") === "recovery" || params.get("recovery") === "1"
        ? "recovery"
        : "error",
    tokenHash: null,
    tokenType: null,
  };
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { resetPassword } = useAuth();
  const initialCallback = parseCallback();
  const [state, setState] = useState<CallbackState>(initialCallback.state);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initialCallback.tokenHash || !initialCallback.tokenType) return;
    const query = new URLSearchParams({
      token_hash: initialCallback.tokenHash,
      type: initialCallback.tokenType,
    });
    // Some Supabase templates redirect to the SPA route instead of the API
    // route. Forward only the one-time token hash immediately; the API
    // exchanges it and sets the opaque HttpOnly recovery session.
    window.location.replace(`/api/auth/callback?${query.toString()}`);
  }, [initialCallback.tokenHash, initialCallback.tokenType]);

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state !== "recovery") return;
    setSubmitting(true);
    try {
      await resetPassword(password);
      setLocation("/walk");
    } catch (reason) {
      setState("error");
    } finally {
      setSubmitting(false);
    }
  };

  const isRecovery = state === "recovery";
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-[400px] text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          {isRecovery ? (
            <KeyRound size={27} aria-hidden="true" />
          ) : (
            <ShieldCheck size={28} aria-hidden="true" />
          )}
        </div>
        {isRecovery && (
          <>
            <h1 className="text-2xl font-medium">Choose a new password</h1>
            <p className="mt-3 text-muted-foreground">
              Use at least 8 characters to secure your Emmaus account.
            </p>
            <form className="mt-6 space-y-4 text-left" onSubmit={submitPassword}>
              <input
                type="email"
                name="username"
                autoComplete="username"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
              <label htmlFor="new-password" className="text-sm font-medium">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
                className="w-full h-12 rounded-xl border border-input bg-background px-3 text-base outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="submit"
                className="w-full h-12 rounded-xl text-base"
                disabled={submitting}
              >
                {submitting ? "Saving password…" : "Save new password"}
              </Button>
            </form>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="text-2xl font-medium">We could not open this link</h1>
            <p role="alert" className="mt-3 text-muted-foreground">
              This account link is incomplete or has expired.
            </p>
            <Button
              type="button"
              className="mt-6 h-12 rounded-xl"
              onClick={() => setLocation("/auth")}
            >
              Return to sign in
            </Button>
          </>
        )}
      </div>
    </div>
  );
}