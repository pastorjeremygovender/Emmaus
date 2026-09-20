import { ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { rememberOpeningDestination } from '@/lib/opening-destination';
import { routePathname } from '@/lib/route-access';
import BrandedSplash, {
  SPLASH_FADE_MS,
  SPLASH_STORAGE_KEY,
} from '@/components/BrandedSplash';

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function isPublicPath(pathname: string): boolean {
  return pathname === '/privacy-policy' ||
    pathname === '/delete-account' ||
    pathname === '/app' ||
    pathname === '/auth' ||
    pathname === '/auth/callback' ||
    pathname === '/onboarding' ||
    pathname.startsWith('/join-room/') ||
    pathname.startsWith('/groups/join/');
}

export default function OpeningGate({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, loadingProfile } = useAuth();
  const [location, setLocation] = useLocation();
  const [splashPhase, setSplashPhase] = useState<'visible' | 'fading' | 'done'>(() => (
    sessionStorage.getItem(SPLASH_STORAGE_KEY) === 'true' ? 'done' : 'visible'
  ));

  const pathname = routePathname(location);
  const needsOnboarding = Boolean(user && !user.preferredName?.trim());
  const needsRecovery = Boolean(user?.passwordRecovery) && pathname !== '/auth/callback';

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

  const openingReady = !authLoading && !loadingProfile;

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

  if (splashPhase !== 'done') {
    return <BrandedSplash fading={splashPhase === 'fading'} />;
  }

  // On a retained WebView, the branded splash has already been acknowledged
  // in sessionStorage. Keep showing a visible loading state while the auth
  // request restores the session instead of letting Welcome render nothing.
  // Public pages do not need to wait for account restoration.
  if ((pathname === '/' || !isPublicPath(pathname)) && (authLoading || loadingProfile)) {
    return <BrandedSplash />;
  }

  return <>{children}</>;
}
