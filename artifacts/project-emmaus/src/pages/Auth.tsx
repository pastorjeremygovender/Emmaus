import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

export default function Auth() {
  const [, setLocation] = useLocation();
  const { signIn, signUp, signInDemo, isDemoMode, user } = useAuth();

  const searchParams = new URLSearchParams(window.location.search);
  const initialMode = searchParams.get('mode') === 'register' ? 'register' : 'login';

  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already authed
  useEffect(() => {
    if (user) {
      if (user.role === 'admin') setLocation('/admin');
      else if (!user.currentFeeling) setLocation('/checkin');
      else setLocation('/walk');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      setError('Please tell us your preferred name.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const role = await signIn(email, password);
        setLocation(role === 'admin' ? '/admin' : '/checkin');
      } else {
        await signUp(email, password, name);
        setLocation('/checkin');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    signInDemo(false);
    setLocation('/checkin');
  };

  const handleDemoAdmin = () => {
    signInDemo(true);
    setLocation('/admin');
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background px-6 py-6 relative">
      <button
        onClick={() => setLocation('/')}
        className="absolute top-6 left-6 p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Back to welcome"
        data-testid="button-back"
      >
        <ArrowLeft size={22} />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 flex items-center justify-center"
      >
        <div className="w-full max-w-[400px]">
          <div className="space-y-2 text-center mb-10">
            <h1 className="text-[32px] font-sans font-medium tracking-tight leading-tight">
              {mode === 'login' ? 'Welcome back' : 'Begin your journey'}
            </h1>
            <p className="text-base text-muted-foreground">
              {mode === 'login'
                ? 'Sign in to continue walking.'
                : 'Create an account to save your progress.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {error && (
              <div
                role="alert"
                className="p-4 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20"
              >
                {error}
              </div>
            )}

            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  Preferred Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How should we address you?"
                  className="h-12 text-base rounded-xl"
                  autoComplete="given-name"
                  data-testid="input-name"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@example.com"
                className="h-12 text-base rounded-xl"
                autoComplete="email"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 text-base rounded-xl"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                data-testid="input-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base rounded-xl mt-2"
              disabled={loading}
              data-testid="button-submit"
            >
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-sm text-foreground/60 hover:text-foreground transition-colors underline underline-offset-2 min-h-[44px] px-4"
              data-testid="button-toggle-mode"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>

          {isDemoMode && (
            <div className="pt-8 mt-6 border-t border-border">
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">Or explore without an account</p>
                <Button
                  variant="secondary"
                  onClick={handleDemo}
                  className="w-full h-12 text-base rounded-xl"
                  data-testid="button-demo"
                >
                  Continue with Demo
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDemoAdmin}
                  className="w-full h-12 text-base rounded-xl"
                  data-testid="button-demo-admin"
                >
                  Continue as Demo Admin
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
