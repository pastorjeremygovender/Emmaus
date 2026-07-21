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
      title: 'Coming Soon',
      description: 'Full Bible integration is on the way.',
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-12 max-w-[480px] mx-auto space-y-9">

        <header className="space-y-1.5">
          <h1 className="text-[30px] font-serif font-medium tracking-tight">Scripture</h1>
          <p className="text-sm text-muted-foreground">
            Prototype — full Bible integration coming soon.
          </p>
        </header>

        {/* Search */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Search Scripture
          </h2>
          <div className="relative">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={17}
              aria-hidden="true"
            />
            <Input
              placeholder="Search passages…"
              className="pl-10 h-12 text-base rounded-xl"
              readOnly
              onClick={handleSoon}
              data-testid="input-scripture-search"
              aria-label="Search Scripture"
            />
          </div>
        </section>

        {/* Continue Reading */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Continue Reading
          </h2>
          <Card className="bg-card border-border">
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                  Psalm 23 · Public Domain (KJV)
                </span>
                <p className="font-serif text-[18px] leading-[1.65] text-foreground">
                  "The Lord is my shepherd; I shall not want. He maketh me to lie down in
                  green pastures: he leadeth me beside the still waters."
                </p>
                <p className="text-[13px] text-muted-foreground">
                  Sample text only — not connected to a Bible translation.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl text-base"
                onClick={handleSoon}
                data-testid="button-continue-reading"
              >
                Continue Chapter
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Saved Verses */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Saved Verses
          </h2>
          <div className="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-2xl text-center space-y-3">
            <div className="w-11 h-11 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
              <Bookmark size={19} aria-hidden="true" />
            </div>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Verses you save will appear here.
            </p>
          </div>
        </section>

      </main>
      <BottomNav />
    </div>
  );
}
