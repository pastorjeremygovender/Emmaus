import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  React.useEffect(() => {
    if (user) {
      if (!user.currentFeeling) setLocation('/checkin');
      else setLocation('/walk');
    }
  }, [user, setLocation]);

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
        await signIn(email, password);
      } else {
        await signUp(email, password, name);
      }
      setLocation('/checkin');
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

  return (
    <div className="min-h-[100dvh] flex flex-col p-6 bg-background relative">
      <button 
        onClick={() => setLocation('/')}
        className="absolute top-6 left-6 p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={24} />
      </button>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 flex items-center justify-center w-full max-w-sm mx-auto"
      >
        <div className="w-full space-y-6">
          <div className="space-y-2 text-center mb-8">
            <h1 className="text-3xl font-serif font-medium tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Begin your journey'}
            </h1>
            <p className="text-muted-foreground">
              {mode === 'login' ? 'Sign in to continue walking.' : 'Create an account to save your progress.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-xl">
                {error}
              </div>
            )}
            
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="name">Preferred Name</Label>
                <Input 
                  id="name" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="How should we address you?"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input 
                id="password" 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <Button type="submit" className="w-full mt-6" disabled={loading}>
              {loading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </Button>
          </form>

          <div className="text-center mt-6">
            <button 
              type="button" 
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {mode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>

          {isDemoMode && (
            <div className="pt-8 mt-8 border-t border-border">
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">Or try the app without an account</p>
                <Button variant="secondary" onClick={handleDemo} className="w-full">
                  Continue with Demo
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
