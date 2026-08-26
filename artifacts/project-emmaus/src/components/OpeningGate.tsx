import { ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { getDailyRhythmStartup, type DailyRhythmStartup } from '@/lib/journeys-api';
import { rememberOpeningDestination } from '@/lib/opening-destination';

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isPublicPath(pathname: string): boolean {
  return pathname === '/' ||
    pathname === '/auth' ||
    pathname === '/auth/callback' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/join-room/');
}

function isDailyRhythmTarget(pathname: string, assignedDay: number | null): boolean {
  return assignedDay !== null && pathname === `/daily-rhythm/day/${assignedDay}`;
}

function LoadingOpening() {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center" role="status">
      <p className="text-muted-foreground text-sm">Preparing today’s opening…</p>
    </div>
  );
}

function OpeningError({
  reference,
  onRetry,
}: {
  reference?: string;
  onRetry: () => void;
}) {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center space-y-4">
        <h1 className="font-serif text-xl">Today’s opening is unavailable</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Emmaus could not safely decide where to begin. Nothing has been marked complete.
        </p>
        {reference && <p className="text-xs text-muted-foreground">Reference: {reference}</p>}
        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export default function OpeningGate({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, loadingProfile } = useAuth();
  const [location, setLocation] = useLocation();
  const [decision, setDecision] = useState<DailyRhythmStartup | null>(null);
  const [error, setError] = useState<Error & { diagnosticReference?: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const requestedPathRef = useRef<string | null>(null);

  const pathname = location.split('?')[0];
  const needsOnboarding = Boolean(user && !user.preferredName?.trim() && pathname !== '/onboarding');
  const authenticatedExempt = pathname === '/auth' ||
    pathname === '/auth/callback' ||
    (pathname === '/onboarding' && needsOnboarding);
  const needsOpening = Boolean(user) && !authenticatedExempt && !isAdminPath(pathname);
  const retry = () => {
    requestedPathRef.current = null;
    setRetryKey(value => value + 1);
  };

  useEffect(() => {
    const refresh = () => {
      setDecision(null);
      setError(null);
      setRetryKey(value => value + 1);
    };
    window.addEventListener('emmaus:opening-completed', refresh);
    return () => window.removeEventListener('emmaus:opening-completed', refresh);
  }, []);

  useEffect(() => {
    if (authLoading || loadingProfile || !user || !needsOpening || needsOnboarding) return;
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (requestedPathRef.current === path && (decision || error)) return;
    requestedPathRef.current = path;
    const controller = new AbortController();
    setDecision(null);
    setError(null);
    void getDailyRhythmStartup({ signal: controller.signal })
      .then(setDecision)
      .catch((reason: Error & { diagnosticReference?: string }) => {
        if (reason.name !== 'AbortError') setError(reason);
      });
    return () => controller.abort();
  }, [authLoading, loadingProfile, user?.id, needsOpening, needsOnboarding, retryKey, decision, error]);

  useEffect(() => {
    if (authLoading || loadingProfile || user || isPublicPath(pathname) || isAdminPath(pathname)) return;
    rememberOpeningDestination(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    setLocation('/auth', { replace: true });
  }, [authLoading, loadingProfile, user, pathname, setLocation]);

  useEffect(() => {
    if (!user || authLoading || loadingProfile || !needsOnboarding) return;
    rememberOpeningDestination(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    setLocation('/onboarding', { replace: true });
  }, [user, authLoading, loadingProfile, needsOnboarding, setLocation]);

  useEffect(() => {
    if (!decision || !user || needsOnboarding) return;
    if (decision.state === 'OPENING_REQUIRED') {
      if (!isDailyRhythmTarget(pathname, decision.assignedDay)) {
        if (pathname !== '/' && pathname !== '/walk') {
          rememberOpeningDestination(`${window.location.pathname}${window.location.search}${window.location.hash}`);
        }
        setLocation(decision.destination, { replace: true });
      }
      return;
    }
    if (decision.state === 'COMPLETED' && pathname === '/') {
      setLocation('/walk', { replace: true });
    }
  }, [decision, pathname, user, needsOnboarding, setLocation]);

  if (!user || isAdminPath(pathname) || authenticatedExempt) {
    return <>{children}</>;
  }
  if (authLoading || loadingProfile || needsOnboarding || !decision) {
    if (error) {
      return <OpeningError reference={error.diagnosticReference} onRetry={retry} />;
    }
    return <LoadingOpening />;
  }
  if (error) {
    return <OpeningError reference={error.diagnosticReference} onRetry={retry} />;
  }
  return <>{children}</>;
}