import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const roomDetailSource = readFileSync(
  resolve(process.cwd(), 'src/pages/rooms/RoomDetail.tsx'),
  'utf8',
);
const roomsApiSource = readFileSync(
  resolve(process.cwd(), 'src/lib/rooms-api.ts'),
  'utf8',
);

describe('active meeting synchronization contract', () => {
  it('does not record attendance when the room page merely observes an active session', () => {
    expect(roomDetailSource).not.toContain('Attendance auto-record');
    expect(roomDetailSource).toContain('const handleJoinMeeting = async () =>');
    expect(roomDetailSource).toContain('onClick={handleJoinMeeting}');
  });

  it('uses the exact room/session key and refetches after attendance events', () => {
    expect(roomDetailSource).toContain(
      'room:${String(roomId)}:session:${sessionId}:attendance',
    );
    expect(roomDetailSource).toContain(
      "lastEvent?.type === 'attendance_changed'",
    );
    expect(roomDetailSource).toContain("window.addEventListener('online', refresh)");
    expect(roomDetailSource).toContain(
      "document.addEventListener('visibilitychange', handleVisibility)",
    );
  });

  it('returns the server attendance record from an explicit join', () => {
    expect(roomsApiSource).toContain('): Promise<SessionAttendee> {');
    expect(roomsApiSource).toContain(
      'roomsFetch<{ ok: true; attendance: SessionAttendee }>',
    );
    expect(roomsApiSource).toContain('return data.attendance;');
  });
});