import React from 'react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider } from './contexts/AuthContext';
import { JourneyProvider } from './contexts/JourneyContext';
import { RoomsProvider } from './contexts/RoomsContext';
import { BibleProvider } from './contexts/BibleContext';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FloatingEmmausButton } from '@/components/FloatingEmmausButton';

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

// Ask Emmaus
import AskEmmausHome from '@/pages/personal/AskEmmausHome';
import AskEmmausConversation from '@/pages/personal/AskEmmausConversation';
import AskEmmausHistory from '@/pages/personal/AskEmmausHistory';

// Bible
import BrowseBooks from '@/pages/bible/BrowseBooks';
import BookDetail from '@/pages/bible/BookDetail';
import ChapterReader from '@/pages/bible/ChapterReader';
import ChapterCompletion from '@/pages/bible/ChapterCompletion';
import BibleJourneyDetail from '@/pages/bible/BibleJourneyDetail';

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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/auth" component={Auth} />
      <Route path="/checkin" component={CheckIn} />
      <Route path="/walk" component={Walk} />
      <Route path="/journey/:journeyId/day/:day" component={JourneyDay} />

      {/* Bible */}
      <Route path="/bible" component={Bible} />
      <Route path="/bible/books" component={BrowseBooks} />
      <Route path="/bible/books/:bookId" component={BookDetail} />
      <Route path="/bible/read/:bookId/:chapter" component={ChapterReader} />
      <Route path="/bible/complete/:bookId/:chapter" component={ChapterCompletion} />
      <Route path="/bible/journey/:journeyId" component={BibleJourneyDetail} />

      <Route path="/journeys" component={Journeys} />
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
