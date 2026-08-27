import { ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { getDailyRhythmStartup, type DailyRhythmStartup } from '@/lib/journeys-api';
import {
  consumeOpeningDestination,
  rememberOpeningDestination,
} from '@/lib/opening-destination';
import { accountStorageKey } from '@/lib/account-storage';
import { localDateKey } from '@/lib/daily-lock';
import { isColdMemberLaunchPath } from '@/lib/tab-paths';
import { resetStartupRouting } from '@/lib/startup-routing';
import BrandedSplash, {
  SPLASH_FADE_MS,
  SPLASH_STORAGE_KEY,
} from '@/components/BrandedSplash';

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isRoomPath(pathname: string): boolean {
  return pathname === '/rooms' || pathname.startsWith('/rooms/');
}

function isPublicPath(pathname: string): boolean {
  return pathname === '/' ||
    pathname === '/auth' ||
    pathname === '/auth/callback' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/join-room/') ||
    pathname.startsWith('/groups/join/');
}

function isDailyRhythmTarget(pathname: string, assignedDay: number | null): boolean {
  return assignedDay !== null && pathname === `/daily-rhythm/day/${assignedDay}`;
}

const OPENING_CACHE_KEY = 'emmaus_opening_resolved_v1';

function hasResolvedOpeningToday(subject: string): boolean {
  try {
    return localStorage.getItem(accountStorageKey(OPENING_CACHE_KEY, subject)) === localDateKey();
  } catch {
    return false;
  }
}

function rememberResolvedOpening(subject: string): void {
  try {
    localStorage.setItem(accountStorageKey(OPENING_CACHE_KEY, subject), localDateKey());
  } catch {
    // A missing performance cache never changes the server-authoritative flow.
  }
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
  const [startupResolved, setStartupResolved] = useState(false);
  const [forceStartup, setForceStartup] = useState(false);
  const [splashPhase, setSplashPhase] = useState<'visible' | 'fading' | 'done'>(() => (
    sessionStorage.getItem(SPLASH_STORAGE_KEY) === 'true' ? 'done' : 'visible'
  ));
  const requestedPathRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null>(user?.id ?? null);

  const pathname = location.split('?')[0];
  const needsOnboarding = Boolean(user && !user.preferredName?.trim());
  const needsRecovery = Boolean(user?.passwordRecovery) && pathname !== '/auth/callback';
  const cachedOpening = Boolean(user && hasResolvedOpeningToday(user.id));
  const openingResolved = !forceStartup && (startupResolved || cachedOpening);
  const authenticatedExempt = pathname === '/auth' ||
    pathname === '/auth/callback' ||
    (pathname === '/onboarding' && needsOnboarding) ||
    // Room navigation is an in-session action. It must not be interrupted by
    // the Daily Rhythm opening decision after the member has already entered
    // the app.
    isRoomPath(pathname);
  const isOpeningEntryPath = pathname === '/' || isColdMemberLaunchPath(pathname);
  const needsOpening = Boolean(user) &&
    !authenticatedExempt &&
    !isAdminPath(pathname) &&
    !needsRecovery &&
    isOpeningEntryPath &&
    !openingResolved;
  const retry = () => {
    requestedPathRef.current = null;
    setRetryKey(value => value + 1);
  };

  useEffect(() => {
    if (previousUserIdRef.current === (user?.id ?? null)) return;
    previousUserIdRef.current = user?.id ?? null;
    resetStartupRouting();
    setStartupResolved(false);
    setForceStartup(false);
    setDecision(null);
    setError(null);
  }, [user?.id]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const completedDecision = (event as CustomEvent<{ decision?: DailyRhythmStartup }>).detail?.decision;
      if (completedDecision?.state === 'COMPLETED') {
        setDecision(completedDecision);
        setError(null);
        return;
      }
      setDecision(null);
      setError(null);
      setRetryKey(value => value + 1);
    };
    window.addEventListener('emmaus:opening-completed', refresh);
    return () => window.removeEventListener('emmaus:opening-completed', refresh);
  }, []);

  // A retained PWA can keep this component mounted while the device is locked
  // or the app is backgrounded.  Re-resolve on resume instead of trusting the
  // decision made before the server calendar day changed.  pageshow covers
  // bfcache/PWA restores; visibilitychange covers screen-lock/background
  // resumes.  Both can fire for one restore, so coalesce them into one request.
  useEffect(() => {
    let disposed = false;
    let refreshQueued = false;
    const refreshOnResume = () => {
      if (refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        if (disposed || document.visibilityState === 'hidden') return;
        if (
          authLoading ||
          loadingProfile ||
          !user ||
          needsOnboarding ||
          (pathname !== '/' && pathname !== '/walk')
        ) return;
        requestedPathRef.current = null;
        setForceStartup(true);
        setStartupResolved(false);
        setDecision(null);
        setError(null);
        setRetryKey(value => value + 1);
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshOnResume();
    };
    window.addEventListener('pageshow', refreshOnResume);
    window.addEventListener('online', refreshOnResume);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      disposed = true;
      window.removeEventListener('pageshow', refreshOnResume);
      window.removeEventListener('online', refreshOnResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authLoading, loadingProfile, user, needsOnboarding, pathname]);

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
  }, [authLoading, loadingProfile, user?.id, needsOpening, needsOnboarding, retryKey]);

  useEffect(() => {
    if (authLoading || loadingProfile || user || isPublicPath(pathname) || isAdminPath(pathname)) return;
    rememberOpeningDestination(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    setLocation('/auth', { replace: true });
  }, [authLoading, loadingProfile, user, pathname, setLocation]);

  useEffect(() => {
    if (!user || authLoading || loadingProfile || !needsOnboarding || needsRecovery || pathname === '/onboarding') return;
    rememberOpeningDestination(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    setLocation('/onboarding', { replace: true });
  }, [user, authLoading, loadingProfile, needsOnboarding, needsRecovery, pathname, setLocation]);

  useEffect(() => {
    if (!user || authLoading || loadingProfile || !needsRecovery) return;
    setLocation('/auth/callback?mode=recovery', { replace: true });
  }, [user, authLoading, loadingProfile, needsRecovery, setLocation]);

  useEffect(() => {
    if (!decision || !user || needsOnboarding || needsRecovery) return;
    if (decision.state === 'OPENING_REQUIRED') {
      rememberResolvedOpening(user.id);
      setForceStartup(false);
      setStartupResolved(true);
      if (!isDailyRhythmTarget(pathname, decision.assignedDay)) {
        if (pathname !== '/' && pathname !== '/walk') {
          rememberOpeningDestination(`${window.location.pathname}${window.location.search}${window.location.hash}`);
        }
        setLocation(decision.destination, { replace: true });
      }
      return;
    }
    if (decision.state === 'COMPLETED') {
      rememberResolvedOpening(user.id);
      setForceStartup(false);
      setStartupResolved(true);
      if (pathname === '/') {
        setLocation(consumeOpeningDestination('/walk'), { replace: true });
      }
      return;
    }
  }, [decision, pathname, user, needsOnboarding, needsRecovery, setLocation]);

  // Once today's opening has already been resolved, entering the root again
  // should be as quick as a normal in-app navigation. The cached result is only
  // valid for this user and this local calendar day; tomorrow still rechecks
  // the server ledger.
  useEffect(() => {
    if (
      !user ||
      needsOnboarding ||
      needsRecovery ||
      !cachedOpening ||
      startupResolved ||
      forceStartup ||
      pathname !== '/'
    ) return;
    setLocation(consumeOpeningDestination('/walk'), { replace: true });
  }, [
    user,
    needsOnboarding,
    needsRecovery,
    cachedOpening,
    startupResolved,
    forceStartup,
    pathname,
    setLocation,
  ]);

  const openingReady = !authLoading &&
    !loadingProfile &&
    (!needsOpening || Boolean(decision) || Boolean(error));

  useEffect(() => {
    if (splashPhase !== 'visible' || !openingReady) return;
    sessionStorage.setItem(SPLASH_STORAGE_KEY, 'true');
    setSplashPhase('fading');
  }, [openingReady, splashPhase]);

  useEffect(() => {
    if (splashPhase !== 'fading') return;
    const timer = window.setTimeout(() => setSplashPhase('done'), SPLASH_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [splashPhase]);

  if (error && user && needsOpening) {
    return <OpeningError reference={error.diagnosticReference} onRetry={retry} />;
  }
  if (splashPhase !== 'done') {
    return <BrandedSplash fading={splashPhase === 'fading'} />;
  }

  if (!user || (isAdminPath(pathname) && !needsRecovery) || authenticatedExempt || !needsOpening) {
    return <>{children}</>;
  }
  if (authLoading || loadingProfile || needsOnboarding || needsRecovery || !decision) {
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