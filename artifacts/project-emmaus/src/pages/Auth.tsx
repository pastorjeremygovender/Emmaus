import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function Auth() {
  const [, setLocation] = useLocation();
  const { signIn, user, loading } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const isRegister = searchParams.get("mode") === "register";
  const signInFailed = searchParams.get("error") === "signin";

  useEffect(() => {
    if (!user) return;
    setLocation(
      user.role === "admin" || user.role === "superAdmin"
        ? "/admin"
        : "/walk",
    );
  }, [setLocation, user]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background px-6 py-6 relative">
      <button
        onClick={() => {
          if (window.history.length > 1) window.history.back();
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
              <ShieldCheck size={28} aria-hidden="true" />
            </div>
            <h1 className="text-[32px] font-sans font-medium tracking-tight leading-tight">
              {isRegister ? "Begin your journey" : "Welcome back"}
            </h1>
            <p className="text-base text-muted-foreground">
              {isRegister
                ? "Create your secure account to save your progress."
                : "Sign in securely to continue walking."}
            </p>
          </div>

          {signInFailed && (
            <div
              role="alert"
              className="mb-5 p-4 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20"
            >
              We could not complete sign-in. Please try again.
            </div>
          )}

          <Button
            type="button"
            className="w-full h-12 text-base rounded-xl"
            onClick={signIn}
            disabled={loading}
            data-testid="button-secure-sign-in"
          >
            {loading
              ? "Checking your session…"
              : isRegister
                ? "Create secure account"
                : "Continue securely"}
          </Button>

          <p className="mt-5 text-center text-sm text-muted-foreground leading-relaxed">
            Sign-in and account creation are handled on a secure identity page.
            Emmaus never receives your password.
          </p>

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() =>
                setLocation(isRegister ? "/auth" : "/auth?mode=register")
              }
              className="text-sm text-foreground/60 hover:text-foreground transition-colors underline underline-offset-2 min-h-[44px] px-4"
              data-testid="button-toggle-mode"
            >
              {isRegister
                ? "Already have an account? Sign in"
                : "Don't have an account? Create one"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}