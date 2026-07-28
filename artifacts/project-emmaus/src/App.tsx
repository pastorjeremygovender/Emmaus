import React from 'react';
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

/** Redirect /journey/15-minutes-with-jesus/day/:day → /daily-rhythm/day/:day */
function LegacyDailyRhythmRedirect({ day }: { day: string }) {
  const [, setLocation] = useLocation();
  React.useEffect(() => {
    setLocation(`/daily-rhythm/day/${day}`);
  }, [day]);
  return null;
}

function Router() {
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
      <Route path="/journey/:journeyId/day/:day" component={JourneyDay} />

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
