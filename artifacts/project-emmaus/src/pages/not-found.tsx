import { useLocation } from 'wouter';
import { ChevronLeft, Footprints, BookOpen, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { goBackOrFallback } from '@/lib/return-context';

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-8 text-center gap-8">
      {/* Emmaus mark */}
      <div className="w-16 h-16 rounded-full bg-primary/8 flex items-center justify-center">
        <Map size={28} className="text-primary/50" />
      </div>

      <div className="space-y-2 max-w-xs">
        <h1 className="text-[22px] font-semibold text-foreground tracking-tight">
          We couldn't find what you were looking for.
        </h1>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          The page you came from may have moved or no longer exists.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button
          variant="outline"
          className="h-11 rounded-xl text-[15px] w-full gap-2"
          onClick={() => goBackOrFallback('/walk', setLocation)}
          aria-label="Go back"
        >
          <ChevronLeft size={16} />
          Back
        </Button>
        <Button
          className="h-11 rounded-xl text-[15px] w-full gap-2"
          onClick={() => setLocation('/walk')}
          aria-label="Go to Walk"
        >
          <Footprints size={16} />
          Go to Walk
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-xl text-[15px] w-full gap-2"
          onClick={() => setLocation('/journeys')}
          aria-label="Go to Journeys"
        >
          <Map size={16} />
          Go to Journeys
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-xl text-[15px] w-full gap-2"
          onClick={() => setLocation('/bible')}
          aria-label="Go to Bible"
        >
          <BookOpen size={16} />
          Go to Bible
        </Button>
      </div>
    </div>
  );
}
