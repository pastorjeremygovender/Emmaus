import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { LogOut, Heart } from 'lucide-react';
import { useLocation } from 'wouter';

export default function Personal() {
  const { user, signOut } = useAuth();
  const { progress, reflections, journeys } = useJourney();
  const [, setLocation] = useLocation();
  const [prayerRequest, setPrayerRequest] = useState('');
  const [notifs, setNotifs] = useState(true);

  if (!user) return null;

  const coreJourneyId = "15-minutes-with-jesus";
  const coreProg = progress[coreJourneyId];
  const streak = coreProg ? coreProg.completedDays.length : 0;
  
  // Collect reflections
  const savedReflections = Object.entries(reflections).map(([key, text]) => {
    const [jId, day] = key.split('-');
    const j = journeys.find(j => j.id === jId);
    return { title: j ? `${j.title} — Day ${day}` : `Day ${day}`, text };
  });

  const handleSignOut = () => {
    signOut();
    setLocation('/');
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-6 pt-12 max-w-lg mx-auto space-y-10">
        
        <header className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-serif font-medium">
            {user.preferredName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-serif font-medium">{user.preferredName}</h1>
            <p className="text-sm text-muted-foreground">{streak} days walking</p>
          </div>
        </header>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Prayer Requests</h2>
          <Card className="bg-card">
            <CardContent className="p-4 space-y-3">
              <Textarea 
                placeholder="What can we pray for today?"
                value={prayerRequest}
                onChange={(e) => setPrayerRequest(e.target.value)}
                className="resize-none bg-background border-border"
              />
              <Button size="sm" variant="secondary" className="w-full">Save Note</Button>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Saved Reflections</h2>
          {savedReflections.length === 0 ? (
            <div className="p-6 border border-dashed border-border rounded-xl text-center">
              <p className="text-sm text-muted-foreground">Your reflections will appear here as you journey.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedReflections.map((r, i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">{r.title}</h4>
                  <p className="text-sm text-foreground italic">"{r.text}"</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Settings</h2>
          <div className="p-4 rounded-xl border border-border bg-card flex justify-between items-center">
            <span className="text-sm font-medium">Daily Reminders</span>
            <Switch checked={notifs} onCheckedChange={setNotifs} />
          </div>
        </section>

        <Button variant="ghost" className="w-full text-destructive flex gap-2" onClick={handleSignOut}>
          <LogOut size={18} />
          Sign Out
        </Button>

      </main>
      <BottomNav />
    </div>
  );
}
