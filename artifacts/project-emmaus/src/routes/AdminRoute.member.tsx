import React from 'react';
import { useLocation } from 'wouter';

export default function AdminRoute() {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation('/walk', { replace: true });
  }, [setLocation]);
  return null;
}
