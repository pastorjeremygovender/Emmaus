import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';

export default function Welcome() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-background">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex flex-col items-center max-w-sm w-full text-center space-y-12"
      >
        <div className="space-y-4">
          <h1 className="text-4xl font-serif font-medium text-foreground tracking-tight">Project Emmaus</h1>
          <p className="text-lg text-muted-foreground font-serif italic">Walk with Jesus, one step at a time.</p>
        </div>
        
        <div className="w-full space-y-4 flex flex-col">
          <Link href="/auth?mode=register" className="w-full">
            <Button size="lg" className="w-full rounded-xl text-md shadow-sm">
              Get Started
            </Button>
          </Link>
          <Link href="/auth?mode=login" className="w-full">
            <Button variant="outline" size="lg" className="w-full rounded-xl text-md bg-transparent">
              Sign In
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
