import { describe, expect, it, beforeEach } from 'vitest';
import {
  EMMAUS_PRODUCTION_ORIGIN,
  extractGroupInviteToken,
  groupInvitePath,
  groupInviteUrl,
  rememberGroupInvite,
  consumeGroupInvite,
  safeGroupInviteDestination,
} from '@/lib/groups-invite';

const TOKEN = '123e4567-e89b-12d3-a456-426614174000';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('Group invitation links', () => {
  it('always creates the canonical production URL', () => {
    expect(groupInviteUrl(TOKEN)).toBe(
      `${EMMAUS_PRODUCTION_ORIGIN}/groups/join/${TOKEN}`,
    );
  });

  it('extracts both current and legacy invite links', () => {
    expect(extractGroupInviteToken(`/groups/join/${TOKEN}`)).toBe(TOKEN);
    expect(extractGroupInviteToken(`https://emmaus.co.za/join-room/${TOKEN}?source=share`)).toBe(TOKEN);
    expect(extractGroupInviteToken('https://example.com/groups/join/nope')).toBeNull();
  });

  it('only accepts safe internal invite return destinations', () => {
    expect(safeGroupInviteDestination(`/groups/join/${TOKEN}`)).toBe(`/groups/join/${TOKEN}`);
    expect(safeGroupInviteDestination('https://evil.example/phish')).toBeNull();
    expect(safeGroupInviteDestination('/admin')).toBeNull();
    expect(groupInvitePath(TOKEN)).toBe(`/groups/join/${TOKEN}`);
  });

  it('keeps an invite through auth and consumes it after completion', () => {
    const path = `/groups/join/${TOKEN}`;
    rememberGroupInvite(path);
    sessionStorage.removeItem('emmaus_pending_group_invite_v1');
    expect(consumeGroupInvite()).toBe(path);
    expect(localStorage.getItem('emmaus_pending_group_invite_v1')).toBeNull();
  });
});