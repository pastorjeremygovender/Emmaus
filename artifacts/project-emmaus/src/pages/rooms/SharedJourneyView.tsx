/**
 * SharedJourneyView — retired pending full implementation.
 * Redirects to the Room detail page where linked journeys are now shown.
 */
import { useEffect } from 'react';
import { useParams, useLocation } from 'wouter';

export default function SharedJourneyView() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(roomId ? `/rooms/${roomId}` : '/rooms', { replace: true });
  }, [roomId, setLocation]);

  return null;
}
