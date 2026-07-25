import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

export default function Welcome() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // If the user already has a session, skip the splash and go directly to their home.
  useEffect(() => {
    if (!loading && user) {
      setLocation(user.role === 'admin' ? '/admin' : '/walk');
    }
  }, [user, loading]);

  // Show nothing while checking session to avoid a flash of the splash for returning users.
  if (loading || user) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-16 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="flex flex-col items-center w-full max-w-[360px] text-center"
      >
        {/* Title block */}
        <div className="space-y-4 mb-16">
          <h1 className="text-[40px] leading-tight font-sans font-medium text-foreground tracking-tight">
            Emmaus
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Walk with Jesus.
          </p>
        </div>

        {/* Actions */}
        <div className="w-full space-y-3 flex flex-col">
          <Link href="/auth?mode=register" className="w-full">
            <Button
              size="lg"
              className="w-full h-14 rounded-2xl text-[17px] font-medium shadow-sm"
              data-testid="button-get-started"
            >
              Get Started
            </Button>
          </Link>
          <Link href="/auth?mode=login" className="w-full">
            <Button
              variant="outline"
              size="lg"
              className="w-full h-14 rounded-2xl text-[17px] font-medium bg-transparent"
              data-testid="button-sign-in"
            >
              Sign In
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
