import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useRooms } from '@/contexts/RoomsContext';
import { useAuth } from '@/contexts/AuthContext';
import { Users, User, ChevronRight, X } from 'lucide-react';
import type { RoomSummary } from '@/lib/rooms-types';

interface Props {
  journeyId: string;
  journeyTitle: string;
  onClose: () => void;
  /** Called when the user chooses "alone" — let the caller navigate.
   *  Return a resolved Promise for success, or reject/throw to surface an error. */
  onStartAlone: () => Promise<void>;
  /** Called when the user has selected a room and wants to start shared.
   *  Return a resolved Promise for success, or reject/throw to surface an error. */
  onStartWithRoom: (roomId: string) => Promise<void>;
}

type Step = 'choice' | 'room-select';

export default function JourneyStartModal({ journeyId, journeyTitle, onClose, onStartAlone, onStartWithRoom }: Props) {
  const { user } = useAuth();
  const { getMyRooms, startSharedJourney } = useRooms();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>('choice');
  const [mode, setMode] = useState<'alone' | 'together'>('alone');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // ── iOS ghost-click guard ────────────────────────────────────────────────────
  // iOS Safari fires a phantom 300ms-delayed click at the same screen coordinates
  // as the tap that opened this modal.  That phantom click lands on the backdrop
  // as a *direct-target* native event (not a bubbled child event), so
  // stopPropagation on the inner sheet cannot intercept it.  The backdrop check
  // `e.target === e.currentTarget` evaluates true for that phantom click, causing
  // onClose() to fire and clearing pendingItem before the user can tap Continue.
  //
  // Fix: suppress backdrop closes for the first 350ms after mount (just past the
  // 300ms ghost-click window).  After that the tap-backdrop-to-close UX works
  // normally.
  const backdropReady = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { backdropReady.current = true; }, 350);
    return () => clearTimeout(t);
  }, []);

  const myRooms: RoomSummary[] = user ? getMyRooms(user.id) : [];

  const handleContinue = async () => {
    if (mode === 'alone') {
      setStartError(null);
      setIsStarting(true);
      try {
        await onStartAlone();
      } catch (err) {
        console.error('[Emmaus] Walk start failed:', err);
        setStartError('Something went wrong — please try again.');
      } finally {
        setIsStarting(false);
      }
      return;
    }
    // With others
    if (step === 'choice') {
      setStep('room-select');
    }
  };

  const handleRoomSelect = (roomId: string) => {
    if (selectedRoomId === roomId) {
      setSelectedRoomId(null);
    } else {
      setSelectedRoomId(roomId);
    }
  };

  const handleStartWithRoom = async () => {
    if (!selectedRoomId || !user) return;
    setStartError(null);
    setIsStarting(true);
    try {
      await onStartWithRoom(selectedRoomId);
    } catch (err) {
      console.error('[Emmaus] Walk start (with room) failed:', err);
      setStartError('Something went wrong — please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    // Backdrop — clicking the dark overlay closes the modal.
    // The backdropReady guard prevents iOS ghost-click phantom events (fired 300ms after
    // the original card tap) from reaching onClose() and clearing pendingItem.
    // stopPropagation on the inner sheet still prevents bubbled clicks from reaching here.
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={(e) => {
        if (!backdropReady.current) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[480px] bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          {step === 'room-select' ? (
            <button
              onClick={() => setStep('choice')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors -mr-2"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {step === 'choice' && (
          <div className="px-6 space-y-6" style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 2rem))' }}>
            <div className="space-y-1 text-center">
              <h2 className="text-[22px] font-sans font-semibold leading-snug">
                How would you like to do this walk?
              </h2>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {/* Alone */}
              <button
                onClick={() => setMode('alone')}
                className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${
                  mode === 'alone'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/40'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    mode === 'alone' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    <User size={20} />
                  </div>
                  <div>
                    <div className="font-semibold text-[16px] text-foreground">I'd like to do this alone</div>
                    <div className="text-[14px] text-muted-foreground mt-0.5 leading-relaxed">
                      A private walk between you and Jesus.
                    </div>
                  </div>
                </div>
              </button>

              {/* Together */}
              <button
                onClick={() => setMode('together')}
                className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${
                  mode === 'together'
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/40'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    mode === 'together' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    <Users size={20} />
                  </div>
                  <div>
                    <div className="font-semibold text-[16px] text-foreground">I'd like to do this with others</div>
                    <div className="text-[14px] text-muted-foreground mt-0.5 leading-relaxed">
                      Invite family, friends or a group to walk together.
                    </div>
                  </div>
                </div>
              </button>
            </div>

            <Button
              className="w-full h-12 rounded-2xl text-[16px]"
              onClick={handleContinue}
              disabled={isStarting}
            >
              {isStarting ? 'Starting…' : 'Continue'}
            </Button>

            {startError && (
              <p className="text-center text-[13px] text-destructive" role="alert">
                {startError}
              </p>
            )}

            <p className="text-center text-[13px] text-muted-foreground">
              You can always invite others later.
            </p>
          </div>
        )}

        {step === 'room-select' && (
          <div className="px-6 pb-8 space-y-5">
            <div className="space-y-1">
              <h2 className="text-[20px] font-sans font-semibold">Who would you like to walk with?</h2>
              <p className="text-[14px] text-muted-foreground">Choose a Room to walk this together.</p>
            </div>

            {myRooms.length === 0 ? (
              <div className="p-6 bg-muted/40 rounded-2xl text-center space-y-3">
                <p className="text-[15px] text-muted-foreground">You're not in any Rooms yet.</p>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => { onClose(); setLocation('/rooms/create'); }}
                >
                  Create a Room
                </Button>
                <Button
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => { onClose(); setLocation('/rooms/join'); }}
                >
                  Join a Room
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {myRooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => handleRoomSelect(room.id)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                      selectedRoomId === room.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        selectedRoomId === room.id ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                        <Users size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[15px] truncate">{room.name}</div>
                        <div className="text-[12px] text-muted-foreground">{room.memberCount} {room.memberCount === 1 ? 'member' : 'members'}</div>
                      </div>
                      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                    </div>
                  </button>
                ))}

                {/* Create / Join options */}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-xl text-[13px]"
                    onClick={() => { onClose(); setLocation('/rooms/create'); }}
                  >
                    Create new Room
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-xl text-[13px]"
                    onClick={() => { onClose(); setLocation('/rooms/join'); }}
                  >
                    Join a Room
                  </Button>
                </div>
              </div>
            )}

            {startError && (
              <p className="text-center text-[13px] text-destructive" role="alert">
                {startError}
              </p>
            )}

            {selectedRoomId && (
              <Button
                className="w-full h-12 rounded-2xl text-[16px]"
                onClick={handleStartWithRoom}
                disabled={isStarting}
              >
                {isStarting ? 'Starting…' : 'Start with this Room'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
