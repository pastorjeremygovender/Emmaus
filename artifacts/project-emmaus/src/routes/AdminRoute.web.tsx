import React from 'react';
import { useLocation } from 'wouter';
import Admin from '@/pages/Admin';
import { isMemberAppRuntime } from '@/lib/app-target';

function MemberAppAdminRedirect() {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation('/walk', { replace: true });
  }, [setLocation]);
  return null;
}

export default function AdminRoute() {
  return isMemberAppRuntime() ? <MemberAppAdminRedirect /> : <Admin />;
}
