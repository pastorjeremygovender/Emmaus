/**
 * RoomDiscussion — retired pending full implementation.
 * Redirects to the Room detail page.
 */
import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';

export default function RoomDiscussion() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(roomId ? `/rooms/${roomId}` : '/rooms', { replace: true });
  }, [roomId, setLocation]);

  return null;
}
