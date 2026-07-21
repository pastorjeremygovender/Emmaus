import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Admin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  if (!user || user.role !== 'admin') {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p>You do not have permission to view this page.</p>
        <Button onClick={() => setLocation('/walk')}>Back to Walk</Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border bg-card p-4 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => setLocation('/walk')} className="text-muted-foreground">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-medium flex-1">Pastor Admin</h1>
        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-medium">Demo Mode</span>
      </header>
      
      <main className="p-6 max-w-2xl mx-auto space-y-8">
        
        <div className="p-6 bg-accent/10 border border-accent/20 rounded-xl space-y-2">
          <h2 className="font-medium text-accent-foreground">Welcome to Emmaus Admin</h2>
          <p className="text-sm text-accent-foreground/80">
            This is a placeholder for the pastoral review interface. Here you will be able to review, edit, and publish weekly companion journeys and core content.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Journeys</h2>
          
          <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
            
            <div className="p-4 flex justify-between items-center bg-card">
              <div>
                <h3 className="font-medium">God's Kindness Restores the Broken</h3>
                <p className="text-xs text-muted-foreground">Sermon Companion • 5 Days</p>
              </div>
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">Published</span>
            </div>
            
            <div className="p-4 flex justify-between items-center bg-card">
              <div>
                <h3 className="font-medium">15 Minutes with Jesus</h3>
                <p className="text-xs text-muted-foreground">Core Journey • 7 Days</p>
              </div>
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">Published</span>
            </div>

            <div className="p-4 flex justify-between items-center bg-card opacity-60">
              <div>
                <h3 className="font-medium">Sunday Draft - Nov 12</h3>
                <p className="text-xs text-muted-foreground">Sermon Companion • Draft</p>
              </div>
              <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full font-medium">Needs Review</span>
            </div>

          </div>
        </section>

      </main>
    </div>
  );
}
