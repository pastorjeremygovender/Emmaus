import React, { useEffect } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AuthProvider } from './contexts/AuthContext';
import { JourneyProvider } from './contexts/JourneyContext';
import { RoomsProvider } from './contexts/RoomsContext';
import { BibleProvider } from './contexts/BibleContext';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FloatingEmmausButton } from '@/components/FloatingEmmausButton';

// Pages
import Welcome from '@/pages/Welcome';
import Onboarding from '@/pages/Onboarding';
import Auth from '@/pages/Auth';
import CheckIn from '@/pages/CheckIn';
import Walk from '@/pages/Walk';
import JourneyDay from '@/pages/JourneyDay';
import DailyRhythmDay from '@/pages/DailyRhythmDay';
import PreviousDays from '@/pages/PreviousDays';
import DevotionalDay from '@/pages/DevotionalDay';
import DevotionalPreviousDays from '@/pages/DevotionalPreviousDays';
import SermonCompanionReader from '@/pages/SermonCompanionReader';
import SermonCompanionPreviousDays from '@/pages/SermonCompanionPreviousDays';
import JourneyPreviousDays from '@/pages/JourneyPreviousDays';
import Bible from '@/pages/Bible';
import Journeys from '@/pages/Journeys';
import JourneyDetail from '@/pages/journeys/JourneyDetail';
import ExploreJourneys from '@/pages/journeys/ExploreJourneys';
import CollectionPage from '@/pages/journeys/CollectionPage';
import Personal from '@/pages/Personal';
import Admin from '@/pages/Admin';
import NotFound from '@/pages/not-found';

// Ask Emmaus
import AskEmmausHome from '@/pages/personal/AskEmmausHome';
import AskEmmausConversation from '@/pages/personal/AskEmmausConversation';
import AskEmmausHistory from '@/pages/personal/AskEmmausHistory';

// Bible
import BrowseBooks from '@/pages/bible/BrowseBooks';
import BookDetail from '@/pages/bible/BookDetail';
import ChapterReader from '@/pages/bible/ChapterReader';
import BibleJourneyDetail from '@/pages/bible/BibleJourneyDetail';
import BibleSearch from '@/pages/bible/BibleSearch';
import ReadingHistory from '@/pages/bible/ReadingHistory';

// Rooms
import Rooms from '@/pages/rooms/Rooms';
import RoomDetail from '@/pages/rooms/RoomDetail';
import CreateRoom from '@/pages/rooms/CreateRoom';
import JoinByCode from '@/pages/rooms/JoinByCode';
import JoinByLink from '@/pages/rooms/JoinByLink';
import InviteMembers from '@/pages/rooms/InviteMembers';
import SharedJourneyView from '@/pages/rooms/SharedJourneyView';
import RoomDiscussion from '@/pages/rooms/RoomDiscussion';
import RoomSettings from '@/pages/rooms/RoomSettings';

/**
 * Startup routing rule (locked):
 * Every fresh page load must land on Today's Steps (/walk), never on a
 * previously-visited tab.  The flag is false on each fresh JS execution
 * (hard refresh, new tab, PWA reopen, browser restart) and true from the
 * moment the Router first mounts — so within-session tab navigation is
 * unaffected.
 */
let _startupChecked = false;

/** Redirect /journey/15-minutes-with-jesus/day/:day → /daily-rhythm/day/:day */
function LegacyDailyRhythmRedirect({ day }: { day: string }) {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation(`/daily-rhythm/day/${day}`);
  }, [day]);
  return null;
}

/**
 * Tab section prefixes that must route through Welcome on every cold start
 * or warm resume so that auth, profile loading, onboarding and
 * resolveEntryRoute() can run and land on /walk.
 *
 * IMPORTANT: matched with startsWith so that deep paths such as
 * /bible/read/john/3 or /journeys/explore are caught in addition to
 * the tab roots themselves.  Previously only the three exact root strings
 * were checked, which meant any sub-path within a tab bypassed Welcome
 * entirely on relaunch — the root cause of "always opens on My Bible".
 */
const TAB_PREFIXES = ['/bible', '/journeys', '/personal'];

/** Returns true when a path belongs to one of the three non-home tabs. */
function isTabPath(path: string): boolean {
  return TAB_PREFIXES.some(p => path === p || path.startsWith(p + '/'));
}

function Router() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!_startupChecked) {
      _startupChecked = true;
      // If the browser has loaded directly onto any tab path (root or deep),
      // redirect through Welcome so that auth, profile loading, onboarding
      // and resolveEntryRoute() all run normally and land on /walk.
      if (isTabPath(location)) {
        setLocation('/');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mobile, iOS/Android may keep the PWA/browser tab alive in memory
  // without re-executing the JS module, so _startupChecked stays true and the
  // startup redirect above never fires when the user switches back to the app.
  // This visibilitychange listener handles that case: when the document
  // transitions from hidden → visible and the current path is any tab path
  // (root or deep sub-path), redirect to / so auth + entry-route runs again.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Use window.location.pathname to get the current path at the moment
        // the event fires (the wouter location value is captured at render time
        // and may be stale inside a closure).
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        const currentPath = window.location.pathname.replace(base, '') || '/';
        if (isTabPath(currentPath)) {
          setLocation('/');
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  // setLocation is stable; no other deps needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/auth" component={Auth} />
      <Route path="/checkin" component={CheckIn} />
      <Route path="/walk" component={Walk} />
      {/* Canonical Daily Rhythm routes */}
      <Route path="/daily-rhythm/previous" component={PreviousDays} />
      <Route path="/daily-rhythm/day/:dayNumber" component={DailyRhythmDay} />
      {/* Daily Devotionals */}
      <Route path="/devotional/:seriesId/previous" component={DevotionalPreviousDays} />
      <Route path="/devotional/:seriesId/day/:day" component={DevotionalDay} />
      {/* Legacy redirect — /journey/15-minutes-with-jesus/day/:day → canonical */}
      <Route path="/journey/15-minutes-with-jesus/day/:day">
        {(params) => <LegacyDailyRhythmRedirect day={params?.day ?? '1'} />}
      </Route>
      <Route path="/journey/:journeyId/previous" component={JourneyPreviousDays} />
      <Route path="/journey/:journeyId/day/:day" component={JourneyDay} />
      {/* Sermon companion reader — for AI-generated companions in the sermon_companion table */}
      <Route path="/sermon-companion/:id/previous" component={SermonCompanionPreviousDays} />
      <Route path="/sermon-companion/:id/day/:day" component={SermonCompanionReader} />

      {/* Bible */}
      <Route path="/bible" component={Bible} />
      <Route path="/bible/books" component={BrowseBooks} />
      <Route path="/bible/search" component={BibleSearch} />
      <Route path="/bible/history" component={ReadingHistory} />
      <Route path="/bible/books/:bookId" component={BookDetail} />
      <Route path="/bible/read/:bookId/:chapter" component={ChapterReader} />
      <Route path="/bible/journey/:journeyId" component={BibleJourneyDetail} />

      <Route path="/journeys" component={Journeys} />
      <Route path="/journeys/explore" component={ExploreJourneys} />
      <Route path="/journeys/collections/:id" component={CollectionPage} />
      <Route path="/journeys/:id" component={JourneyDetail} />
      <Route path="/personal" component={Personal} />
      <Route path="/personal/ask-emmaus" component={AskEmmausHome} />
      <Route path="/personal/ask-emmaus/conversation" component={AskEmmausConversation} />
      <Route path="/personal/ask-emmaus/conversation/:id" component={AskEmmausConversation} />
      <Route path="/personal/ask-emmaus/history/:id" component={AskEmmausHistory} />
      <Route path="/admin" component={Admin} />

      {/* Rooms */}
      <Route path="/rooms" component={Rooms} />
      <Route path="/rooms/create" component={CreateRoom} />
      <Route path="/rooms/join" component={JoinByCode} />
      <Route path="/rooms/:roomId/invite" component={InviteMembers} />
      <Route path="/rooms/:roomId/settings" component={RoomSettings} />
      <Route path="/rooms/:roomId/journey/:journeyId/view" component={SharedJourneyView} />
      <Route path="/rooms/:roomId/journey/:journeyId/day/:day/discussion" component={RoomDiscussion} />
      <Route path="/rooms/:roomId" component={RoomDetail} />

      {/* Invite link */}
      <Route path="/join-room/:inviteToken" component={JoinByLink} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <AuthProvider>
      <JourneyProvider>
        <RoomsProvider>
          <BibleProvider>
            <TooltipProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <Router />
                <FloatingEmmausButton />
              </WouterRouter>
              <Toaster />
            </TooltipProvider>
          </BibleProvider>
        </RoomsProvider>
      </JourneyProvider>
    </AuthProvider>
  );
}

export default App;
