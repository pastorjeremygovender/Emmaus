import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Trash2, Eye, EyeOff } from 'lucide-react';
import { DEMO_USER_2 } from '@/lib/rooms-demo-data';
import type { SharedReflection } from '@/lib/rooms-types';

const DEMO_NAMES: Record<string, string> = {
  'demo-user-1': 'Friend',
  'demo-user-2': DEMO_USER_2.preferredName,
  'demo-admin-1': 'Jeremy',
};

function displayName(userId: string, currentUserId: string) {
  const name = DEMO_NAMES[userId] || 'Member';
  return userId === currentUserId ? `${name} (you)` : name;
}

export default function RoomDiscussion() {
  const { roomId, journeyId, day: dayStr } = useParams<{ roomId: string; journeyId: string; day: string }>();
  const day = parseInt(dayStr || '1', 10);
  const { user } = useAuth();
  const {
    getRoom, getMyMembership, canInvite,
    getPosts, addPost, removePost,
    getSharedReflections, getMySharedReflection,
    shareReflection, revokeSharedReflection,
  } = useRooms();
  const { getStep, getJourney, reflections } = useJourney();
  const [, setLocation] = useLocation();
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  if (!user || !roomId || !journeyId) return null;

  const room = getRoom(roomId);
  const myMembership = getMyMembership(roomId, user.id);
  if (!room || !myMembership) {
    return <div className="p-6 text-center mt-20 text-muted-foreground">Room not found.</div>;
  }

  const journey = getJourney(journeyId);
  const step = getStep(journeyId, day);
  const stepId = `day-${day}`;
  const posts = getPosts(roomId, journeyId, stepId);
  const sharedReflections = getSharedReflections(roomId, journeyId, stepId);
  const isLeaderOrOwner = canInvite(roomId, user.id);

  // My personal reflection for this step
  const myReflectionKey = `${journeyId}-${day}`;
  const myReflectionText = reflections[myReflectionKey];
  const myShared = getMySharedReflection(user.id, myReflectionKey, roomId);

  const handlePost = () => {
    if (!body.trim()) return;
    setPosting(true);
    addPost(roomId, journeyId, stepId, user.id, body.trim());
    setBody('');
    setPosting(false);
  };

  const handleShareReflection = () => {
    shareReflection(user.id, myReflectionKey, roomId, journeyId, stepId);
  };

  const handleRevokeReflection = (sr: SharedReflection) => {
    revokeSharedReflection(sr.id, user.id);
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-28">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => setLocation(`/rooms/${roomId}/journey/${journeyId}/view`)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 text-center px-3">
            <div className="font-medium text-sm truncate">{step?.title ?? `Day ${day}`}</div>
            <div className="text-[12px] text-muted-foreground">{journey?.title} · {room.name}</div>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-8 pb-6">

        {/* Optional discussion question */}
        {step?.reflectionQuestion && (
          <div className="p-5 bg-card border border-border rounded-2xl space-y-2">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Discussion Question
            </div>
            <p className="text-[16px] text-foreground leading-relaxed">{step.reflectionQuestion}</p>
          </div>
        )}

        {/* Shared Reflections */}
        {sharedReflections.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Shared Reflections
            </h2>
            <div className="space-y-3">
              {sharedReflections.map(sr => {
                const srReflText = sr.userId === user.id ? reflections[sr.userReflectionKey] : undefined;
                const isOwn = sr.userId === user.id;
                const name = displayName(sr.userId, user.id);
                const initials = name.replace(' (you)', '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                return (
                  <div key={sr.id} className="p-4 rounded-xl border border-primary/15 bg-primary/5 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                      <span className="text-[13px] font-medium text-foreground">{name}</span>
                    </div>
                    {isOwn && srReflText ? (
                      <p className="text-[15px] text-foreground italic leading-relaxed">"{srReflText}"</p>
                    ) : (
                      <p className="text-[14px] text-muted-foreground italic">Shared a reflection</p>
                    )}
                    {isOwn && (
                      <button
                        onClick={() => handleRevokeReflection(sr)}
                        className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <EyeOff size={13} />
                        Revoke sharing
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Share my reflection toggle */}
        {myReflectionText && (
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              My Reflection
            </h2>
            <div className="p-4 bg-card border border-border rounded-xl space-y-3">
              <p className="text-[15px] text-foreground italic leading-relaxed">"{myReflectionText}"</p>
              {!myShared ? (
                <button
                  onClick={handleShareReflection}
                  className="flex items-center gap-1.5 text-[13px] text-primary font-medium hover:underline"
                >
                  <Eye size={14} />
                  Share this reflection with your Room
                </button>
              ) : (
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <Eye size={14} className="text-primary" />
                  <span>Shared with this Room ·</span>
                  <button
                    onClick={() => handleRevokeReflection(myShared)}
                    className="text-muted-foreground hover:text-destructive underline"
                  >
                    Revoke
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Discussion thread */}
        <section className="space-y-4">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Discussion
          </h2>

          {posts.length === 0 && (
            <div className="p-6 border border-dashed border-border rounded-xl text-center">
              <p className="text-[14px] text-muted-foreground">No responses yet. Be the first to share a thought.</p>
            </div>
          )}

          {posts.map(post => {
            const name = displayName(post.userId, user.id);
            const initials = name.replace(' (you)', '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
            const canRemove = post.userId === user.id || isLeaderOrOwner;
            return (
              <div key={post.id} className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-muted text-foreground text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1">
                    <span className="text-[13px] font-medium text-foreground">{name}</span>
                    <span className="text-[12px] text-muted-foreground ml-2">
                      {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {canRemove && (
                    <button
                      onClick={() => {
                        if (window.confirm('Remove this post?')) removePost(post.id, user.id, roomId);
                      }}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="ml-9">
                  <p className="text-[15px] text-foreground leading-relaxed">{post.body}</p>
                </div>
              </div>
            );
          })}
        </section>

        {/* Post input */}
        <div className="space-y-3">
          <Textarea
            placeholder="Share an encouragement or thought…"
            value={body}
            onChange={e => setBody(e.target.value)}
            className="min-h-[90px] text-[16px] resize-none rounded-xl"
          />
          <Button
            className="w-full h-11 rounded-xl"
            onClick={handlePost}
            disabled={!body.trim() || posting}
          >
            Post
          </Button>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
