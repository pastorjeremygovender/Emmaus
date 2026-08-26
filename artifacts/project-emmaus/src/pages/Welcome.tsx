/**
 * Welcome — unauthenticated/auth transition boundary.
 *
 * OpeningGate owns the branded cold-launch presentation and all authenticated
 * opening decisions. Welcome only handles auth, onboarding, recovery, and
 * pending invite boundaries.
 */

import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { rememberOpeningDestination } from '@/lib/opening-destination';

export default function Welcome() {
  const { user, loading: authLoading, loadingProfile } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (authLoading || loadingProfile) return;
    if (user?.passwordRecovery) {
      setLocation('/auth/callback?mode=recovery');
      return;
    }
    const pendingJoin = sessionStorage.getItem('pendingInviteToken');
    if (pendingJoin && user && user.role !== 'admin' && user.role !== 'superAdmin') {
      rememberOpeningDestination(`/join-room/${pendingJoin}`);
      return;
    }
    if (user && !user.preferredName?.trim()) setLocation('/onboarding');
    if (!user) setLocation('/auth');
  }, [authLoading, loadingProfile, user, setLocation]);

  return null;
}
