import React from 'react';
import { BottomNav } from '@/components/BottomNav';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Bookmark } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Bible() {
  const { toast } = useToast();

  const handleSoon = () => {
    toast({
      title: "Coming Soon",
      description: "Full Bible integration is on the way.",
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-6 pt-12 max-w-lg mx-auto space-y-8">
        
        <header className="space-y-2">
          <h1 className="text-3xl font-serif font-medium tracking-tight">Scripture</h1>
          <p className="text-sm text-muted-foreground">Full Bible integration coming soon.</p>
        </header>

        <section className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input 
              placeholder="Search passages..." 
              className="pl-10"
              readOnly
              onClick={handleSoon}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Continue Reading</h2>
          <Card className="bg-card">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">Psalm 23</span>
                <p className="font-serif text-lg leading-relaxed">
                  "The Lord is my shepherd; I shall not want. He maketh me to lie down in green pastures: he leadeth me beside the still waters."
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={handleSoon}>
                Continue Chapter
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Saved Verses</h2>
          <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
              <Bookmark size={20} />
            </div>
            <p className="text-sm text-muted-foreground">Verses you save will appear here.</p>
          </div>
        </section>

      </main>
      <BottomNav />
    </div>
  );
}
