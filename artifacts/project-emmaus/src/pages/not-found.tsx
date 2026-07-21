import React from 'react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-serif font-medium text-foreground">404</h1>
        <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
      </div>
    </div>
  );
}