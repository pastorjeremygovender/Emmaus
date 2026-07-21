import React from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from './contexts/AuthContext';
import { JourneyProvider } from './contexts/JourneyContext';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

// Pages
import Welcome from '@/pages/Welcome';
import Auth from '@/pages/Auth';
import CheckIn from '@/pages/CheckIn';
import Walk from '@/pages/Walk';
import JourneyDay from '@/pages/JourneyDay';
import Bible from '@/pages/Bible';
import Journeys from '@/pages/Journeys';
import Personal from '@/pages/Personal';
import Admin from '@/pages/Admin';
import NotFound from '@/pages/not-found';

function Router() {
  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/auth" component={Auth} />
      <Route path="/checkin" component={CheckIn} />
      <Route path="/walk" component={Walk} />
      <Route path="/journey/:journeyId/day/:day" component={JourneyDay} />
      <Route path="/bible" component={Bible} />
      <Route path="/journeys" component={Journeys} />
      <Route path="/personal" component={Personal} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AuthProvider>
      <JourneyProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </JourneyProvider>
    </AuthProvider>
  );
}

export default App;
