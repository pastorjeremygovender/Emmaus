import { useState, useEffect } from 'react';
import { Heart, Check, Loader2, HandHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PrayerRequest } from '@/lib/rooms-types';
import { apiGetPrayerRequests, apiAddPrayerRequest, apiMarkPrayerAnswered } from '@/lib/rooms-api';

interface PrayerRequestsProps {
  roomId: string;
  userId: string;
  displayName: string;
  isAdmin: boolean;
}

export function PrayerRequests({ roomId, userId, displayName, isAdmin }: PrayerRequestsProps) {
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newRequest, setNewRequest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);

  useEffect(() => {
    apiGetPrayerRequests(userId, roomId)
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [roomId, userId]);

  const handleSubmit = async () => {
    if (!newRequest.trim()) return;
    setSubmitting(true);
    try {
      const req = await apiAddPrayerRequest(userId, roomId, displayName, newRequest.trim());
      setRequests(prev => [req, ...prev]);
      setNewRequest('');
      setShowForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add prayer request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAnswered = async (prayerId: string) => {
    setAnsweringId(prayerId);
    try {
      await apiMarkPrayerAnswered(userId, roomId, prayerId);
      setRequests(prev => prev.map(r => r.id === prayerId ? { ...r, isAnswered: true } : r));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to mark as answered');
    } finally {
      setAnsweringId(null);
    }
  };

  const open = requests.filter(r => !r.isAnswered);
  const answered = requests.filter(r => r.isAnswered);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <HandHeart size={12} />
          Prayer Requests
          {open.length > 0 && (
            <span className="ml-1 bg-primary/15 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {open.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setShowForm(v => !v)}
          className="text-[13px] text-primary font-medium hover:underline"
        >
          {showForm ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <p className="text-[12px] text-muted-foreground">
            Share your prayer request with the group.
          </p>
          <textarea
            value={newRequest}
            onChange={e => setNewRequest(e.target.value)}
            placeholder="What would you like the group to pray for?"
            rows={3}
            className="w-full text-[14px] bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground/50 leading-relaxed"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="rounded-xl flex-1"
              onClick={handleSubmit}
              disabled={submitting || !newRequest.trim()}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : 'Share Request'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-xl px-4"
              onClick={() => { setShowForm(false); setNewRequest(''); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && requests.length === 0 && (
        <div className="p-6 rounded-2xl border border-dashed border-border text-center space-y-1.5">
          <Heart size={20} className="mx-auto text-muted-foreground opacity-30 mb-2" />
          <p className="text-[14px] text-muted-foreground">No prayer requests yet.</p>
          <p className="text-[12px] text-muted-foreground/60">Be the first to share one with your group.</p>
        </div>
      )}

      {/* Open requests */}
      {!loading && open.length > 0 && (
        <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
          {open.map(req => (
            <div key={req.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-foreground leading-relaxed">{req.request}</p>
                  <p className="text-[12px] text-muted-foreground mt-1.5">
                    {req.authorName} · {new Date(req.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => handleMarkAnswered(req.id)}
                    disabled={answeringId === req.id}
                    className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors px-2 py-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800 mt-0.5"
                    title="Mark as answered"
                  >
                    {answeringId === req.id
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Check size={12} />
                    }
                    <span>Answered</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Answered (collapsed by default) */}
      {!loading && answered.length > 0 && (
        <details className="group">
          <summary className="list-none flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              {answered.length} answered prayer{answered.length !== 1 ? 's' : ''} ✓
            </span>
          </summary>
          <div className="mt-2 divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card opacity-60">
            {answered.map(req => (
              <div key={req.id} className="px-5 py-3.5">
                <p className="text-[14px] text-foreground leading-relaxed line-through decoration-muted-foreground/40">
                  {req.request}
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {req.authorName} · <span className="text-emerald-600 dark:text-emerald-400 font-medium">Answered ✓</span>
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
