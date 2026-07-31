/**
 * JourneyStartSheet — bottom sheet shown when a member taps Start on any Walk.
 *
 * Three options:
 *   • On my own       — starts immediately, private
 *   • Use a Room      — shows scrollable list of existing rooms (hidden if none)
 *   • Create a Room   — inline text input; creates room + links journey in one step
 *
 * The sheet animates in from the bottom via framer-motion and is dismissible
 * by tapping the backdrop or pressing the × button.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Users, User, Plus, ChevronRight, X, Loader2 } from 'lucide-react';
import type { RoomSummary } from '@/lib/rooms-types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  journeyTitle: string;
  /** The user's current rooms; pass empty array if none. */
  userRooms: RoomSummary[];
  /** User chose "On my own" */
  onStartAlone: () => Promise<void>;
  /** User chose an existing room */
  onStartInRoom: (roomId: string) => Promise<void>;
  /** User chose to create a new room — receives the room name */
  onCreateAndStart: (roomName: string) => Promise<void>;
  onClose: () => void;
  /** Open the sheet directly on this step (defaults to 'main'). */
  initialStep?: Step;
  /** Pre-select this room when the sheet opens. */
  preSelectedRoomId?: string;
  /** When true, show "Your Room is already walking this journey" nudge in room-list. */
  showRoomNudge?: boolean;
}

type Step = 'main' | 'room-list' | 'create-room';

// ─── Component ────────────────────────────────────────────────────────────────

export default function JourneyStartSheet({
  journeyTitle,
  userRooms,
  onStartAlone,
  onStartInRoom,
  onCreateAndStart,
  onClose,
  initialStep = 'main',
  preSelectedRoomId,
  showRoomNudge = false,
}: Props) {
  const [step, setStep] = useState<Step>(initialStep);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(preSelectedRoomId ?? null);
  const [roomName, setRoomName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const roomNameRef = useRef<HTMLInputElement>(null);

  // Guard against iOS ghost-click (300ms phantom tap after the tap that opened
  // this sheet hits the backdrop and triggers onClose).
  const backdropReady = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { backdropReady.current = true; }, 350);
    return () => clearTimeout(t);
  }, []);

  // Auto-focus the room name input when that step appears
  useEffect(() => {
    if (step === 'create-room') {
      setTimeout(() => roomNameRef.current?.focus(), 100);
    }
  }, [step]);

  // ── Action handlers ────────────────────────────────────────────────────────

  async function doStartAlone() {
    setError('');
    setBusy(true);
    try {
      await onStartAlone();
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function doStartInRoom() {
    if (!selectedRoomId) return;
    setError('');
    setBusy(true);
    try {
      await onStartInRoom(selectedRoomId);
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function doCreateAndStart() {
    const name = roomName.trim();
    if (!name) { setError('Enter a name for your Room.'); return; }
    setError('');
    setBusy(true);
    try {
      await onCreateAndStart(name);
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Back / title per step ─────────────────────────────────────────────────

  const stepTitles: Record<Step, string> = {
    'main': 'How would you like to do this?',
    'room-list': 'Choose a Room',
    'create-room': 'Create a Room',
  };

  function goBack() {
    setError('');
    setSelectedRoomId(null);
    setStep('main');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => {
          if (!backdropReady.current) return;
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Sheet */}
        <motion.div
          className="w-full max-w-[480px] bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Handle + header ─────────────────────────────────────────── */}
          <div className="flex flex-col items-center pt-3 pb-0">
            <div className="w-10 h-1 rounded-full bg-muted mb-4" />
          </div>

          <div className="flex items-center justify-between px-6 pb-2">
            <div className="w-8">
              {step !== 'main' && (
                <button
                  onClick={goBack}
                  className="text-[14px] text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Back"
                >
                  ← Back
                </button>
              )}
            </div>
            <h2 className="text-[17px] font-sans font-semibold text-center flex-1 px-2">
              {stepTitles[step]}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Main step ───────────────────────────────────────────────── */}
          {step === 'main' && (
            <div
              className="px-6 pt-4 space-y-3"
              style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 2rem))' }}
            >
              {/* Journey subtitle */}
              <p className="text-[13px] text-muted-foreground text-center pb-1 truncate">
                {journeyTitle}
              </p>

              {/* On my own */}
              <OptionCard
                icon={<User size={20} />}
                title="On my own"
                description="A private walk between you and Jesus."
                disabled={busy}
                onClick={doStartAlone}
                loading={busy}
              />

              {/* Use an existing Room — hidden if user has no rooms */}
              {userRooms.length > 0 && (
                <OptionCard
                  icon={<Users size={20} />}
                  title="Use an existing Room"
                  description={`Walk this together with ${userRooms.length === 1 ? 'your Room' : 'one of your Rooms'}.`}
                  disabled={busy}
                  onClick={() => setStep('room-list')}
                  chevron
                />
              )}

              {/* Create a Room */}
              <OptionCard
                icon={<Plus size={20} />}
                title="Create a Room"
                description="Walk through this together with family or friends."
                disabled={busy}
                onClick={() => setStep('create-room')}
                chevron
              />

              {error && <ErrorMsg text={error} />}

              <p className="text-center text-[12px] text-muted-foreground pt-1">
                You can always invite others later from Rooms.
              </p>
            </div>
          )}

          {/* ── Room list step ───────────────────────────────────────────── */}
          {step === 'room-list' && (
            <div
              className="px-6 pt-2 space-y-3"
              style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 2rem))' }}
            >
              {showRoomNudge ? (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-primary/8 border border-primary/20">
                  <Users size={14} className="text-primary shrink-0 mt-0.5" />
                  <p className="text-[13px] text-primary leading-snug">
                    Your Room is already walking this journey
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  Select the Room you'd like to walk this journey with.
                </p>
              )}

              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {userRooms.map(room => {
                  const isSelected = selectedRoomId === room.id;
                  return (
                    <button
                      key={room.id}
                      onClick={() => setSelectedRoomId(isSelected ? null : room.id)}
                      className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          <Users size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[15px] font-medium truncate">{room.name}</div>
                          <div className="text-[12px] text-muted-foreground">
                            {room.memberCount} {room.memberCount === 1 ? 'member' : 'members'}
                          </div>
                        </div>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {error && <ErrorMsg text={error} />}

              <Button
                className="w-full h-12 rounded-2xl text-[16px]"
                onClick={doStartInRoom}
                disabled={!selectedRoomId || busy}
              >
                {busy
                  ? <><Loader2 size={16} className="animate-spin mr-2" />Starting…</>
                  : 'Start with this Room'
                }
              </Button>
            </div>
          )}

          {/* ── Create room step ─────────────────────────────────────────── */}
          {step === 'create-room' && (
            <div
              className="px-6 pt-2 space-y-4"
              style={{ paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom) + 2rem))' }}
            >
              <p className="text-[13px] text-muted-foreground">
                Give your Room a name — you can always change it later.
              </p>

              <div className="space-y-1.5">
                <label
                  htmlFor="room-name-input"
                  className="text-[12px] font-medium text-muted-foreground uppercase tracking-widest"
                >
                  Room name
                </label>
                <input
                  id="room-name-input"
                  ref={roomNameRef}
                  type="text"
                  value={roomName}
                  onChange={e => { setRoomName(e.target.value); setError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') doCreateAndStart(); }}
                  placeholder="e.g. The Johnson Family"
                  maxLength={80}
                  className="w-full h-12 px-4 rounded-xl border border-border bg-background text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  disabled={busy}
                  autoComplete="off"
                />
              </div>

              {error && <ErrorMsg text={error} />}

              <Button
                className="w-full h-12 rounded-2xl text-[16px]"
                onClick={doCreateAndStart}
                disabled={!roomName.trim() || busy}
              >
                {busy
                  ? <><Loader2 size={16} className="animate-spin mr-2" />Creating Room…</>
                  : 'Create Room & Start'
                }
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


// ─── Sub-components ───────────────────────────────────────────────────────────
interface OptionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  chevron?: boolean;
}

function OptionCard({ icon, title, description, onClick, disabled, loading, chevron }: OptionCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left p-5 rounded-2xl border-2 border-border bg-card hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10 transition-all disabled:opacity-60 disabled:pointer-events-none"
    >
      <div className="flex items-start gap-4">
        <div className="mt-0.5 w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[16px] text-foreground">{title}</div>
          <div className="text-[14px] text-muted-foreground mt-0.5 leading-relaxed">{description}</div>
        </div>
        {loading && <Loader2 size={18} className="animate-spin text-muted-foreground mt-1 shrink-0" />}
        {chevron && !loading && <ChevronRight size={18} className="text-muted-foreground mt-1 shrink-0" />}
      </div>
    </button>
  );
}

function ErrorMsg({ text }: { text: string }) {
  return (
    <p className="text-center text-[13px] text-destructive" role="alert">
      {text}
    </p>
  );
}
