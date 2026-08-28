import React, { useLayoutEffect } from 'react';
import { Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
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
import OpeningGate from '@/components/OpeningGate';
import { installAppHistoryTracking } from '@/lib/return-context';

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

/** Keep old Discussion URLs working without mounting a separate Room screen. */
function LegacyRoomChatRedirect() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    if (!roomId) return;
    const discussionId = new URLSearchParams(window.location.search).get('discussionId');
    const discussion = discussionId
      ? `&discussionId=${encodeURIComponent(discussionId)}`
      : '';
    setLocation(`/rooms/${roomId}?surface=discussion${discussion}`, { replace: true });
  }, [roomId, setLocation]);
  return null;
}

function Router() {
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
      <Route path="/rooms/:roomId/chat" component={LegacyRoomChatRedirect} />
      <Route path="/rooms/:roomId/invite" component={InviteMembers} />
      <Route path="/rooms/:roomId/settings" component={RoomSettings} />
      <Route path="/rooms/:roomId/journey/:journeyId/view" component={SharedJourneyView} />
      <Route path="/rooms/:roomId/journey/:journeyId/day/:day/discussion" component={RoomDiscussion} />
      <Route path="/rooms/:roomId" component={RoomDetail} />

      {/* Invite link */}
      <Route path="/groups/join/:inviteToken" component={JoinByLink} />
      <Route path="/join-room/:inviteToken" component={JoinByLink} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useLayoutEffect(() => installAppHistoryTracking(), []);

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
                    <OpeningGate>
                      <Router />
                    </OpeningGate>
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
