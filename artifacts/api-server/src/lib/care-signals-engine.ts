/**
 * care-signals-engine.ts — Discipleship Signals Rules Engine (Checkpoint 4).
 *
 * DESIGN PRINCIPLES
 *   - Only observations, never inferences about motives or emotions.
 *   - Every signal includes the exact evidence that triggered it.
 *   - No AI, no scoring, no "risk ratings."
 *   - Adding a new signal = add one new entry to ALL_RULES. No other file changes.
 *
 * SIGNAL CATEGORIES
 *   celebration  — 🟢 positive milestones worth acknowledging
 *   growth       — 🔵 meaningful discipleship activity
 *   attention    — 🟡 patterns that may warrant pastoral awareness
 *   follow_up    — 🟠 situations typically needing direct follow-up
 *   significant  — 🔴 major life events; stay visible longer
 */

export type SignalCategory =
  | "celebration"
  | "growth"
  | "attention"
  | "follow_up"
  | "significant";

// ─── Person context (input) ───────────────────────────────────────────────────

export interface AttRecord {
  sessionDate: string;        // YYYY-MM-DD
  status: string;             // present|visitor|absent|apology|not_expected
  meetingTypeName: string;
}

export interface WalkRecord {
  id: string;
  title: string;
  startedAt: string | null;
  updatedAt: string;
  status: string;             // active|completed|paused|in_progress
  lastCompletedAt: string | null;
}

export interface DevotionalRecord {
  id: string;
  title: string;
  startedAt: string | null;
  updatedAt: string;
  status: string;
}

export interface RoomRecord {
  id: string;
  name: string;
  joinedAt: string | null;
}

export interface MilestoneRecord {
  type: string;
  title: string;
  date: string | null;
  createdAt: string;
}

export interface PersonContext {
  personId: string;
  personType: string;
  emmausUserId: string | null;
  /** Last 16 attendance records, newest first. */
  attendanceRecords: AttRecord[];
  walks: WalkRecord[];
  devotionals: DevotionalRecord[];
  rooms: RoomRecord[];
  milestones: MilestoneRecord[];
}

// ─── Signal output ────────────────────────────────────────────────────────────

export interface SignalDetected {
  signalType: string;
  category: SignalCategory;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;
  /**
   * State-based signals are automatically resolved when the condition no
   * longer holds (e.g. attendance improves after "attendance_declining").
   * Event-based signals are permanent and stay until manually resolved.
   */
  isStateBased: boolean;
}

// ─── Rule definition ──────────────────────────────────────────────────────────

export interface ThresholdDef {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
}

export interface SignalRule {
  id: string;
  category: SignalCategory;
  enabled: boolean;
  title: string;
  description: string;
  isStateBased: boolean;
  /** Numeric thresholds that superAdmins can tune per-church. */
  thresholdDefs?: ThresholdDef[];
  detect(ctx: PersonContext, thresholds?: Record<string, number>): SignalDetected | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(isoDate: string | null | undefined): number {
  if (!isoDate) return 99999;
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function isPresent(status: string): boolean {
  return status === "present" || status === "visitor";
}

function attendedCount(records: AttRecord[]): number {
  return records.filter((r) => isPresent(r.status)).length;
}

function fmtDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "unknown date";
  try {
    const d = new Date(isoDate.length === 10 ? isoDate + "T12:00:00" : isoDate);
    return d.toLocaleDateString("en-ZA", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return isoDate; }
}

function isActive(status: string): boolean {
  return status !== "completed" && status !== "archived";
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export const ALL_RULES: SignalRule[] = [

  // ── CELEBRATION ─────────────────────────────────────────────────────────────

  {
    id: "completed_first_walk",
    category: "celebration",
    enabled: true,
    isStateBased: false,
    title: "Completed first Walk",
    description: "Person completed their first Emmaus Walk.",
    detect(ctx) {
      if (!ctx.emmausUserId) return null;
      const done = ctx.walks.filter((w) => w.status === "completed" && w.lastCompletedAt);
      if (done.length === 0) return null;
      const first = [...done].sort(
        (a, b) => new Date(a.lastCompletedAt!).getTime() - new Date(b.lastCompletedAt!).getTime(),
      )[0];
      return {
        signalType: "completed_first_walk",
        category: "celebration",
        title: "Completed first Walk",
        explanation: `Completed "${first.title}" — their first Emmaus Walk.`,
        evidence: { walkTitle: first.title, completedAt: first.lastCompletedAt },
        isStateBased: false,
      };
    },
  },

  {
    id: "consistent_attendance_8_weeks",
    category: "celebration",
    enabled: true,
    isStateBased: true,
    title: "Consistent attendance for 8 weeks",
    description: "Attended 7 or more of the last 8 expected services.",
    detect(ctx) {
      const eligible = ctx.attendanceRecords
        .filter((r) => r.status !== "not_expected")
        .slice(0, 8);
      if (eligible.length < 6) return null;
      const attended = attendedCount(eligible);
      if (attended < 7) return null;
      return {
        signalType: "consistent_attendance_8_weeks",
        category: "celebration",
        title: "Consistent attendance for 8 weeks",
        explanation: `Attended ${attended} of the last ${eligible.length} services.`,
        evidence: { attended, outOf: eligible.length },
        isStateBased: true,
      };
    },
  },

  // ── SIGNIFICANT (milestones that are also celebrations) ───────────────────

  {
    id: "accepted_christ",
    category: "significant",
    enabled: true,
    isStateBased: false,
    title: "Accepted Christ",
    description: 'The milestone "Accepted Christ" has been recorded.',
    detect(ctx) {
      const m = ctx.milestones.find((x) => x.type === "accepted_christ");
      if (!m) return null;
      return {
        signalType: "accepted_christ",
        category: "significant",
        title: "Accepted Christ",
        explanation: m.date
          ? `Accepted Christ on ${fmtDate(m.date)}.`
          : "Accepted Christ (date not recorded).",
        evidence: { milestoneDate: m.date, recordedAt: m.createdAt },
        isStateBased: false,
      };
    },
  },

  {
    id: "baptised",
    category: "significant",
    enabled: true,
    isStateBased: false,
    title: "Baptised",
    description: 'The milestone "Baptised" has been recorded.',
    detect(ctx) {
      const m = ctx.milestones.find((x) => x.type === "baptised");
      if (!m) return null;
      return {
        signalType: "baptised",
        category: "significant",
        title: "Baptised",
        explanation: m.date
          ? `Baptised on ${fmtDate(m.date)}.`
          : "Baptism recorded (date not confirmed).",
        evidence: { milestoneDate: m.date, recordedAt: m.createdAt },
        isStateBased: false,
      };
    },
  },

  // ── GROWTH ──────────────────────────────────────────────────────────────────

  {
    id: "started_new_walk",
    category: "growth",
    enabled: true,
    isStateBased: false,
    title: "Started a new Walk",
    description: "Started an Emmaus Walk in the last 30 days.",
    detect(ctx) {
      if (!ctx.emmausUserId) return null;
      const recent = ctx.walks
        .filter((w) => w.startedAt && daysAgo(w.startedAt) <= 30 && isActive(w.status))
        .sort((a, b) => new Date(b.startedAt!).getTime() - new Date(a.startedAt!).getTime());
      if (recent.length === 0) return null;
      const w = recent[0];
      const d = daysAgo(w.startedAt);
      return {
        signalType: "started_new_walk",
        category: "growth",
        title: "Started a new Walk",
        explanation: `Started "${w.title}" ${d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`}.`,
        evidence: { walkTitle: w.title, startedAt: w.startedAt, daysAgo: d },
        isStateBased: false,
      };
    },
  },

  {
    id: "started_daily_rhythm",
    category: "growth",
    enabled: true,
    isStateBased: false,
    title: "Started Daily Rhythm",
    description: "Started a devotional series in the last 30 days.",
    detect(ctx) {
      if (!ctx.emmausUserId) return null;
      const recent = ctx.devotionals
        .filter((d) => d.startedAt && daysAgo(d.startedAt) <= 30)
        .sort((a, b) => new Date(b.startedAt!).getTime() - new Date(a.startedAt!).getTime());
      if (recent.length === 0) return null;
      const dev = recent[0];
      const d = daysAgo(dev.startedAt);
      return {
        signalType: "started_daily_rhythm",
        category: "growth",
        title: "Started Daily Rhythm",
        explanation: `Started "${dev.title}" ${d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`}.`,
        evidence: { devotionalTitle: dev.title, startedAt: dev.startedAt },
        isStateBased: false,
      };
    },
  },

  {
    id: "joined_room",
    category: "growth",
    enabled: true,
    isStateBased: false,
    title: "Joined a Room",
    description: "Joined an Emmaus Room in the last 30 days.",
    detect(ctx) {
      if (!ctx.emmausUserId) return null;
      const recent = ctx.rooms
        .filter((r) => r.joinedAt && daysAgo(r.joinedAt) <= 30)
        .sort((a, b) => new Date(b.joinedAt!).getTime() - new Date(a.joinedAt!).getTime());
      if (recent.length === 0) return null;
      const room = recent[0];
      const d = daysAgo(room.joinedAt);
      return {
        signalType: "joined_room",
        category: "growth",
        title: "Joined a Room",
        explanation: `Joined "${room.name}" ${d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`}.`,
        evidence: { roomName: room.name, joinedAt: room.joinedAt },
        isStateBased: false,
      };
    },
  },

  {
    id: "regular_emmaus_engagement",
    category: "growth",
    enabled: true,
    isStateBased: true,
    title: "Regular Emmaus engagement",
    description: "Active in Emmaus in the last 7 days.",
    detect(ctx) {
      if (!ctx.emmausUserId) return null;
      const hasContent = ctx.walks.length > 0 || ctx.devotionals.length > 0;
      if (!hasContent) return null;
      const recentWalk = ctx.walks.some((w) => daysAgo(w.updatedAt) <= 7);
      const recentDev  = ctx.devotionals.some((d) => daysAgo(d.updatedAt) <= 7);
      if (!recentWalk && !recentDev) return null;
      const allDates = [
        ...ctx.walks.map((w) => w.updatedAt),
        ...ctx.devotionals.map((d) => d.updatedAt),
      ].filter(Boolean).sort().reverse();
      const lastDate = allDates[0] ?? null;
      return {
        signalType: "regular_emmaus_engagement",
        category: "growth",
        title: "Regular Emmaus engagement",
        explanation: `Active in Emmaus${lastDate ? ` as recently as ${fmtDate(lastDate)}` : ""}.`,
        evidence: { lastActivityDate: lastDate },
        isStateBased: true,
      };
    },
  },

  // ── ATTENTION ───────────────────────────────────────────────────────────────

  {
    id: "attendance_declining",
    category: "attention",
    enabled: true,
    isStateBased: true,
    title: "Attendance declining",
    description: "Attendance rate has dropped significantly compared with the previous period.",
    detect(ctx) {
      const eligible = ctx.attendanceRecords.filter((r) => r.status !== "not_expected");
      if (eligible.length < 8) return null;
      // Newest 4 = recent; next 4 = previous
      const recent = eligible.slice(0, 4);
      const prev   = eligible.slice(4, 8);
      const recentRate = attendedCount(recent) / recent.length;
      const prevRate   = attendedCount(prev) / prev.length;
      // Only signal when previous was good (≥60%) and recent has dropped (≤40%)
      if (prevRate < 0.6 || recentRate > 0.4) return null;
      return {
        signalType: "attendance_declining",
        category: "attention",
        title: "Attendance declining",
        explanation:
          `Attended ${attendedCount(prev)} of ${prev.length} services before. ` +
          `Attended ${attendedCount(recent)} of ${recent.length} recently.`,
        evidence: {
          prevAttended:   attendedCount(prev),
          prevTotal:      prev.length,
          recentAttended: attendedCount(recent),
          recentTotal:    recent.length,
        },
        isStateBased: true,
      };
    },
  },

  {
    id: "walk_inactive_14_days",
    category: "attention",
    enabled: true,
    isStateBased: true,
    title: "Walk inactive for 14 days",
    description: "An active Walk has had no progress for 14 or more days.",
    thresholdDefs: [{ key: "inactiveDays", label: "Days inactive", default: 14, min: 7, max: 90 }],
    detect(ctx, thresholds) {
      if (!ctx.emmausUserId) return null;
      const minDays = thresholds?.inactiveDays ?? 14;
      const inactive = ctx.walks.filter(
        (w) => isActive(w.status) && daysAgo(w.updatedAt) >= minDays,
      );
      if (inactive.length === 0) return null;
      // Pick the one with the most days inactive
      inactive.sort((a, b) => daysAgo(b.updatedAt) - daysAgo(a.updatedAt));
      const w = inactive[0];
      const d = daysAgo(w.updatedAt);
      return {
        signalType: "walk_inactive_14_days",
        category: "attention",
        title: `Walk inactive for ${minDays} days`,
        explanation: `"${w.title}" has had no progress for ${d} day${d === 1 ? "" : "s"}.`,
        evidence: { walkTitle: w.title, lastActivityDate: w.updatedAt, daysInactive: d },
        isStateBased: true,
      };
    },
  },

  {
    id: "daily_rhythm_stopped",
    category: "attention",
    enabled: true,
    isStateBased: true,
    title: "Daily Rhythm stopped",
    description: "An active devotional has had no progress for 14 or more days.",
    thresholdDefs: [{ key: "inactiveDays", label: "Days inactive", default: 14, min: 7, max: 90 }],
    detect(ctx, thresholds) {
      if (!ctx.emmausUserId) return null;
      const minDays = thresholds?.inactiveDays ?? 14;
      const stopped = ctx.devotionals.filter(
        (d) => isActive(d.status) && daysAgo(d.updatedAt) >= minDays,
      );
      if (stopped.length === 0) return null;
      stopped.sort((a, b) => daysAgo(b.updatedAt) - daysAgo(a.updatedAt));
      const dev = stopped[0];
      const d = daysAgo(dev.updatedAt);
      return {
        signalType: "daily_rhythm_stopped",
        category: "attention",
        title: "Daily Rhythm stopped",
        explanation: `"${dev.title}" has had no progress for ${d} day${d === 1 ? "" : "s"}.`,
        evidence: { devotionalTitle: dev.title, lastActivityDate: dev.updatedAt, daysInactive: d },
        isStateBased: true,
      };
    },
  },

  // ── FOLLOW-UP ────────────────────────────────────────────────────────────────

  {
    id: "missed_three_services",
    category: "follow_up",
    enabled: true,
    isStateBased: true,
    title: "Missed three expected services",
    description: "Missed three or more consecutive expected services.",
    thresholdDefs: [{ key: "consecutiveMissed", label: "Consecutive missed services", default: 3, min: 1, max: 10 }],
    detect(ctx, thresholds) {
      const minMissed = thresholds?.consecutiveMissed ?? 3;
      const eligible = ctx.attendanceRecords.filter((r) => r.status !== "not_expected");
      let consecutive = 0;
      const missed: AttRecord[] = [];
      for (const r of eligible) {
        if (r.status === "absent") { consecutive++; missed.push(r); }
        else break;
      }
      if (consecutive < minMissed) return null;
      return {
        signalType: "missed_three_services",
        category: "follow_up",
        title: `Missed ${minMissed} expected service${minMissed === 1 ? "" : "s"}`,
        explanation:
          `Missed ${consecutive} consecutive expected service${consecutive === 1 ? "" : "s"}. ` +
          `Most recent: ${missed[0]?.meetingTypeName ?? "service"} on ${fmtDate(missed[0]?.sessionDate)}.`,
        evidence: {
          consecutiveMissed: consecutive,
          services: missed.slice(0, 5).map((r) => ({
            date: r.sessionDate,
            meetingType: r.meetingTypeName,
          })),
        },
        isStateBased: true,
      };
    },
  },

  {
    id: "no_emmaus_activity_30_days",
    category: "follow_up",
    enabled: true,
    isStateBased: true,
    title: "No Emmaus activity for 30 days",
    description: "A linked Emmaus user has had no app activity in 30 or more days.",
    thresholdDefs: [{ key: "inactiveDays", label: "Days inactive", default: 30, min: 14, max: 180 }],
    detect(ctx, thresholds) {
      if (!ctx.emmausUserId) return null;
      // Only signal if they were ever meaningfully active
      if (ctx.walks.length === 0 && ctx.devotionals.length === 0) return null;
      const minDays = thresholds?.inactiveDays ?? 30;
      const allDates = [
        ...ctx.walks.map((w) => w.updatedAt),
        ...ctx.devotionals.map((d) => d.updatedAt),
      ].filter(Boolean).sort().reverse();
      if (allDates.length === 0) return null;
      const lastDate = allDates[0];
      const d = daysAgo(lastDate);
      if (d < minDays) return null;
      return {
        signalType: "no_emmaus_activity_30_days",
        category: "follow_up",
        title: `No Emmaus activity for ${minDays} days`,
        explanation: `Last Emmaus activity was ${d} day${d === 1 ? "" : "s"} ago (${fmtDate(lastDate)}).`,
        evidence: { lastActivityDate: lastDate, daysInactive: d },
        isStateBased: true,
      };
    },
  },

  // ── SIGNIFICANT (life events) ─────────────────────────────────────────────

  {
    id: "hospital_visit",
    category: "significant",
    enabled: true,
    isStateBased: false,
    title: "Hospital visit recorded",
    description: "A hospital visit milestone has been recorded.",
    detect(ctx) {
      const m = ctx.milestones.find((x) => x.type === "hospital_visit");
      if (!m) return null;
      return {
        signalType: "hospital_visit",
        category: "significant",
        title: "Hospital visit recorded",
        explanation: m.date
          ? `Hospital visit recorded on ${fmtDate(m.date)}.`
          : "A hospital visit has been recorded.",
        evidence: { milestoneDate: m.date, notes: m.title },
        isStateBased: false,
      };
    },
  },

  {
    id: "bereavement",
    category: "significant",
    enabled: true,
    isStateBased: false,
    title: "Bereavement recorded",
    description: "A bereavement milestone has been recorded.",
    detect(ctx) {
      const m = ctx.milestones.find((x) => x.type === "bereavement");
      if (!m) return null;
      return {
        signalType: "bereavement",
        category: "significant",
        title: "Bereavement recorded",
        explanation: m.date
          ? `Bereavement recorded on ${fmtDate(m.date)}.`
          : "A bereavement has been recorded.",
        evidence: { milestoneDate: m.date, notes: m.title },
        isStateBased: false,
      };
    },
  },

  {
    id: "marriage",
    category: "significant",
    enabled: true,
    isStateBased: false,
    title: "Marriage recorded",
    description: "A marriage milestone has been recorded.",
    detect(ctx) {
      const m = ctx.milestones.find((x) => x.type === "marriage");
      if (!m) return null;
      return {
        signalType: "marriage",
        category: "significant",
        title: "Marriage recorded",
        explanation: m.date ? `Marriage recorded on ${fmtDate(m.date)}.` : "Marriage recorded.",
        evidence: { milestoneDate: m.date },
        isStateBased: false,
      };
    },
  },

  {
    id: "birth_of_child",
    category: "significant",
    enabled: true,
    isStateBased: false,
    title: "Birth of child recorded",
    description: "A birth of child milestone has been recorded.",
    detect(ctx) {
      const m = ctx.milestones.find((x) => x.type === "birth_of_child");
      if (!m) return null;
      return {
        signalType: "birth_of_child",
        category: "significant",
        title: "Birth of child recorded",
        explanation: m.date
          ? `Birth of child recorded on ${fmtDate(m.date)}.`
          : "Birth of child recorded.",
        evidence: { milestoneDate: m.date },
        isStateBased: false,
      };
    },
  },

  {
    id: "pastoral_intervention",
    category: "significant",
    enabled: true,
    isStateBased: false,
    title: "Pastoral intervention recorded",
    description: "A pastoral intervention milestone has been recorded.",
    detect(ctx) {
      const m = ctx.milestones.find((x) => x.type === "pastoral_intervention");
      if (!m) return null;
      return {
        signalType: "pastoral_intervention",
        category: "significant",
        title: "Pastoral intervention recorded",
        explanation: m.date
          ? `Pastoral intervention recorded on ${fmtDate(m.date)}.`
          : "Pastoral intervention recorded.",
        evidence: { milestoneDate: m.date, notes: m.title },
        isStateBased: false,
      };
    },
  },

];

// ─── Engine entry point ───────────────────────────────────────────────────────

export type RuleConfigMap = Map<string, { enabled?: boolean; thresholds?: Record<string, number> }>;

/**
 * Run all enabled rules against a person context.
 * Pass `ruleConfig` to apply per-church enabled/threshold overrides.
 * Returns an array of detected signals (may be empty).
 */
export function detectSignals(ctx: PersonContext, ruleConfig?: RuleConfigMap): SignalDetected[] {
  const results: SignalDetected[] = [];
  for (const rule of ALL_RULES) {
    const cfg = ruleConfig?.get(rule.id);
    const enabled = cfg?.enabled !== undefined ? cfg.enabled : rule.enabled;
    if (!enabled) continue;
    try {
      const signal = rule.detect(ctx, cfg?.thresholds);
      if (signal) results.push(signal);
    } catch {
      // Per-rule failures are non-fatal — engine continues.
    }
  }
  return results;
}
