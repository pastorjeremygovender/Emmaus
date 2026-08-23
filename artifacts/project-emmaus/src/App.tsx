import React, { useEffect, useLayoutEffect } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AuthProvider } from './contexts/AuthContext';
import { JourneyProvider } from './contexts/JourneyContext';
import { RoomsProvider } from './contexts/RoomsContext';
import { BibleProvider } from './contexts/BibleContext';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FloatingEmmausButton } from '@/components/FloatingEmmausButton';
import { VoiceSessionProvider } from '@/contexts/VoiceSessionContext';
import { GlobalVoiceIndicator } from '@/components/emmaus/GlobalVoiceIndicator';
import { InstallPrompt } from '@/components/InstallPrompt';
import { AppearanceProvider } from '@/contexts/AppearanceContext';
import { localDateKey } from '@/lib/daily-lock';

// Pages
import Welcome from '@/pages/Welcome';
import Onboarding from '@/pages/Onboarding';
import Auth from '@/pages/Auth';
import AuthCallback from '@/pages/AuthCallback';
import CheckIn from '@/pages/CheckIn';
import Walk from '@/pages/Walk';
import { StepNavigatorPage } from '@/pages/StepNavigatorPage';
import { DevotionalNavigatorPage } from '@/pages/DevotionalNavigatorPage';
import { SermonCompanionNavigatorPage } from '@/pages/SermonCompanionNavigatorPage';
import JourneyDay from '@/pages/JourneyDay';
import JourneyPreviousDays from '@/pages/JourneyPreviousDays';
import DailyRhythmDay from '@/pages/DailyRhythmDay';
import PreviousDays from '@/pages/PreviousDays';
import DevotionalDay from '@/pages/DevotionalDay';
import DevotionalPreviousDays from '@/pages/DevotionalPreviousDays';
import SermonCompanionReader from '@/pages/SermonCompanionReader';
import SermonCompanionPreviousDays from '@/pages/SermonCompanionPreviousDays';
import SermonCompanionOverview from '@/pages/SermonCompanionOverview';
import SermonHome from '@/pages/SermonHome';
import WalkCompletePage from '@/pages/WalkCompletePage';
import Bible from '@/pages/Bible';
import Journeys from '@/pages/Journeys';
import JourneyDetail from '@/pages/journeys/JourneyDetail';
import ExploreJourneys from '@/pages/journeys/ExploreJourneys';
import CollectionPage from '@/pages/journeys/CollectionPage';
import ContentGroupPage from '@/pages/ContentGroupPage';
import Personal from '@/pages/Personal';
import Admin from '@/pages/Admin';
import NotFound from '@/pages/not-found';

// Ask Emmaus
import AskEmmausHome from '@/pages/personal/AskEmmausHome';
import AskEmmausConversation from '@/pages/personal/AskEmmausConversation';
import AskEmmausHistory from '@/pages/personal/AskEmmausHistory';
import VoiceMode from '@/components/emmaus/VoiceMode';

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
import JoinRoom from '@/pages/rooms/JoinRoom';
import JoinByLink from '@/pages/rooms/JoinByLink';
import InviteMembers from '@/pages/rooms/InviteMembers';
import SharedJourneyView from '@/pages/rooms/SharedJourneyView';
import RoomDiscussion from '@/pages/rooms/RoomDiscussion';
import RoomSettings from '@/pages/rooms/RoomSettings';
import RoomChat from '@/pages/rooms/RoomChat';

/**
 * Startup routing rule (locked):
 * The first opening of each day for a member enters the foundational Daily
 * Rhythm practice (10 Minutes With Jesus). Later openings land on /walk.
 * Admins land on /admin.
 * A RESUME (lock/unlock, app switch, incoming call) must NOT redirect —
 * the user returns to exactly the screen they left.
 *
 * How we distinguish the two:
 *   _startupChecked is a module-level JS variable.  It resets to false only
 *   when the JS context is destroyed — hard refresh, new tab, PWA force-close,
 *   browser restart.  On mobile resume (page kept in Bfcache or memory), JS is
 *   never re-executed so _startupChecked stays true and the redirect below does
 *   NOT fire.  This is the correct behaviour: resume ≠ fresh launch.
 *
 * A visibilitychange listener was previously present here to "catch" mobile
 * resumes where _startupChecked stayed true.  It was removed because that
 * listener fired on every lock/unlock and app switch, redirecting the user to
 * Today's Steps from wherever they were reading.  Do not re-add it.
 */
let _startupChecked = false;

/**
 * ScrollToTop — scrolls to (0, 0) on every pathname change.
 *
 * Placed inside WouterRouter so it has access to wouter context.
 * useLayoutEffect fires synchronously before the browser paints, so the user
 * never sees the new page rendered at the old scroll position.
 *
 * This covers all content navigation (devotional days, walk lessons, Bible
 * chapters, sermon companions, etc.). It does NOT fire on query-string-only
 * changes (?tab=, ?source=) — those don't change the pathname.
 */
function ScrollToTop() {
  const [pathname] = useLocation();
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Redirect /journey/15-minutes-with-jesus/day/:day → /daily-rhythm/day/:day */
function LegacyDailyRhythmRedirect({ day }: { day: string }) {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation(`/daily-rhythm/day/${day}`);
  }, [day]);
  return null;
}

// isTabPath and TAB_PREFIXES live in lib/tab-paths so they can be unit-tested.
import { isTabPath } from '@/lib/tab-paths';

function Router() {
  const [location, setLocation] = useLocation();
  const lastVisibleDateRef = React.useRef(localDateKey());
  const hiddenAtRef = React.useRef<number | null>(null);

  useEffect(() => {
    if (!_startupChecked) {
      _startupChecked = true;
      // If the browser has loaded directly onto any tab path (root or deep),
      // redirect through Welcome so that auth, profile loading, onboarding
      // and the daily-open route runs normally.
      if (isTabPath(location)) {
        setLocation('/');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A PWA can remain mounted overnight, so the module-level startup guard
  // does not run again when the user opens it the next morning. Re-enter
  // through Welcome only after a genuine overnight gap; ordinary app
  // switching, screen locking, and notification shade use must preserve the
  // exact page the member was reading.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      const today = localDateKey();
      const hiddenFor = hiddenAtRef.current === null
        ? 0
        : Date.now() - hiddenAtRef.current;
      const overnightGap = hiddenFor >= 60 * 60 * 1000;
      const normalHome = location === '/' || location === '/walk';

      if (today !== lastVisibleDateRef.current && overnightGap && normalHome) {
        console.debug('[Emmaus routing] overnight re-entry → welcome');
        setLocation('/');
      }

      lastVisibleDateRef.current = today;
      hiddenAtRef.current = null;
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [location, setLocation]);

  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/auth" component={Auth} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/checkin" component={CheckIn} />
      <Route path="/walk" component={Walk} />
      {/* Canonical Daily Rhythm routes */}
      <Route path="/daily-rhythm/navigate">
        {() => <StepNavigatorPage mode="daily-rhythm" />}
      </Route>
      <Route path="/daily-rhythm/previous" component={PreviousDays} />
      <Route path="/daily-rhythm/day/:dayNumber" component={DailyRhythmDay} />
      {/* Daily Devotionals */}
      <Route path="/devotional/:seriesId/navigate" component={DevotionalNavigatorPage} />
      <Route path="/devotional/:seriesId/navigate/group/:groupId" component={DevotionalNavigatorPage} />
      <Route path="/devotional/:seriesId/previous" component={DevotionalPreviousDays} />
      <Route path="/devotional/:seriesId/day/:day" component={DevotionalDay} />
      {/* Legacy redirect — /journey/15-minutes-with-jesus/day/:day → canonical */}
      <Route path="/journey/15-minutes-with-jesus/day/:day">
        {(params) => <LegacyDailyRhythmRedirect day={params?.day ?? '1'} />}
      </Route>
      <Route path="/journey/:journeyId/navigate">
        {(params) => <StepNavigatorPage mode="journey" />}
      </Route>
      <Route path="/journey/:journeyId/previous" component={JourneyPreviousDays} />
      <Route path="/journey/:journeyId/complete" component={WalkCompletePage} />
      <Route path="/journey/:journeyId/day/:day" component={JourneyDay} />
      {/* Sermon companion — overview must be registered before /:id/day/:day to avoid capture */}
      <Route path="/sermon-companion/:id/navigate" component={SermonCompanionNavigatorPage} />
      <Route path="/sermon-companion/:id/overview" component={SermonCompanionOverview} />
      <Route path="/sermon-companion/:id/previous" component={SermonCompanionPreviousDays} />
      <Route path="/sermon-companion/:id/day/:day" component={SermonCompanionReader} />
      <Route path="/sermon/:id" component={SermonHome} />

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
      <Route path="/content-groups/:id" component={ContentGroupPage} />
      <Route path="/journeys/:id" component={JourneyDetail} />
      <Route path="/personal" component={Personal} />
      <Route path="/personal/ask-emmaus" component={AskEmmausHome} />
      <Route path="/personal/ask-emmaus/voice" component={VoiceMode} />
      <Route path="/personal/ask-emmaus/conversation" component={AskEmmausConversation} />
      <Route path="/personal/ask-emmaus/conversation/:id" component={AskEmmausConversation} />
      <Route path="/personal/ask-emmaus/history/:id" component={AskEmmausHistory} />
      <Route path="/admin" component={Admin} />

      {/* Rooms */}
      <Route path="/rooms" component={Rooms} />
      <Route path="/rooms/create" component={CreateRoom} />
      <Route path="/rooms/join" component={JoinRoom} />
      <Route path="/rooms/:roomId/chat" component={RoomChat} />
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
      <AppearanceProvider>
        <JourneyProvider>
          <RoomsProvider>
            <BibleProvider>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                  <VoiceSessionProvider>
                    <ScrollToTop />
                    <Router />
                    <FloatingEmmausButton />
                    <GlobalVoiceIndicator />
                  </VoiceSessionProvider>
                </WouterRouter>
                <Toaster />
                <InstallPrompt />
              </TooltipProvider>
            </BibleProvider>
          </RoomsProvider>
        </JourneyProvider>
      </AppearanceProvider>
    </AuthProvider>
  );
}

export default App;
