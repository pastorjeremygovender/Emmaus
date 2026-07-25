import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function Welcome() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-16 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="flex flex-col items-center w-full max-w-[360px] text-center"
      >
        {/* Title block */}
        <div className="space-y-5 mb-16">
          <h1 className="text-[38px] leading-tight font-serif font-medium text-foreground tracking-tight">
            Emmaus
          </h1>
          <p className="text-lg text-muted-foreground font-serif italic leading-relaxed">
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
