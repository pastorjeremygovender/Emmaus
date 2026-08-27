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
import { rememberGroupInvite, safeGroupInviteDestination } from '@/lib/groups-invite';

export default function Welcome() {
  const { user, loading: authLoading, loadingProfile } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (authLoading || loadingProfile) return;
    if (user?.passwordRecovery) {
      setLocation('/auth/callback?mode=recovery');
      return;
    }
    const pendingJoin =
      safeGroupInviteDestination(sessionStorage.getItem('emmaus_pending_group_invite_v1')) ??
      safeGroupInviteDestination(localStorage.getItem('emmaus_pending_group_invite_v1')) ??
      (sessionStorage.getItem('pendingInviteToken')
        ? `/join-room/${sessionStorage.getItem('pendingInviteToken')}`
        : null);
    if (pendingJoin && user) {
      rememberGroupInvite(pendingJoin);
      rememberOpeningDestination(pendingJoin);
      return;
    }
    if (user && !user.preferredName?.trim()) setLocation('/onboarding');
    if (!user) setLocation('/auth');
  }, [authLoading, loadingProfile, user, setLocation]);

  return null;
}
