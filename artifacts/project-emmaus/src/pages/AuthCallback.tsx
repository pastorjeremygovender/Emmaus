import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

type CallbackState =
  | { kind: "loading" }
  | { kind: "recovery"; accessToken: string; refreshToken?: string }
  | { kind: "error"; message: string };

function parseCallback(): CallbackState {
  const values = new URLSearchParams(window.location.hash.slice(1));
  const error = values.get("error_description") ?? values.get("error");
  const accessToken = values.get("access_token");
  if (error || !accessToken) {
    return {
      kind: "error",
      message: error ?? "This account link is incomplete or has expired.",
    };
  }
  return values.get("type") === "recovery"
    ? {
        kind: "recovery",
        accessToken,
        refreshToken: values.get("refresh_token") ?? undefined,
      }
    : { kind: "loading" };
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const { completeAuthSession, resetPassword } = useAuth();
  const [state, setState] = useState<CallbackState>(parseCallback);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (state.kind === "recovery") {
      // Keep provider tokens out of the visible URL while the member chooses
      // their new password. The values already live only in component state.
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    if (state.kind !== "loading") return;
    const values = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = values.get("access_token");
    const refreshToken = values.get("refresh_token") ?? undefined;
    if (!accessToken) return;
    window.history.replaceState(null, "", window.location.pathname);
    completeAuthSession(accessToken, refreshToken)
      .then(() => setLocation("/walk"))
      .catch((reason) =>
        setState({
          kind: "error",
          message:
            reason instanceof Error
              ? reason.message
              : "We could not finish signing you in.",
        }),
      );
  }, [completeAuthSession, setLocation, state.kind]);

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.kind !== "recovery") return;
    setSubmitting(true);
    try {
      await resetPassword(state.accessToken, state.refreshToken, password);
      window.history.replaceState(null, "", window.location.pathname);
      setLocation("/walk");
    } catch (reason) {
      setState({
        kind: "error",
        message:
          reason instanceof Error
            ? reason.message
            : "We could not reset your password.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isRecovery = state.kind === "recovery";
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
        {state.kind === "loading" && (
          <>
            <h1 className="text-2xl font-medium">Finishing sign-in</h1>
            <p className="mt-3 text-muted-foreground">Please wait a moment.</p>
          </>
        )}
        {isRecovery && (
          <>
            <h1 className="text-2xl font-medium">Choose a new password</h1>
            <p className="mt-3 text-muted-foreground">
              Use at least 8 characters to secure your Emmaus account.
            </p>
            <form className="mt-6 space-y-4 text-left" onSubmit={submitPassword}>
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
        {state.kind === "error" && (
          <>
            <h1 className="text-2xl font-medium">We could not open this link</h1>
            <p role="alert" className="mt-3 text-muted-foreground">
              {state.message}
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