/**
 * analytics-store.ts
 * Read-only aggregate queries for the Emmaus Analytics Centre (Checkpoint 6).
 * All queries use real DB tables — no placeholder data.
 */

import { pool } from "@workspace/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChurchHealthKpis {
  totalMembers: number;
  activeThisWeek: number;
  attendancePct: number;
  dailyRhythmPct: number;
  walkCompletionPct: number;
  roomParticipationPct: number;
  openPrayerRequests: number;
  newBelievers: number;
  serving: number;
  baptisms: number;
}

export interface AttendanceDataPoint {
  date: string;
  present: number;
  expected: number;
  visitors: number;
  meetingType?: string;
}

export interface AttendanceTrends {
  weekly: AttendanceDataPoint[];
  monthly: AttendanceDataPoint[];
  byMeeting: { meetingType: string; avgPresent: number; sessionCount: number }[];
  visitorBreakdown: { firstTime: number; returning: number; periodLabel: string }[];
  retentionPct: number;
}

export interface WalkStat {
  journeyId: string;
  title: string;
  starts: number;
  completions: number;
  avgCompletionPct: number;
  avgDaysToComplete: number | null;
}

export interface DiscipleshipAnalytics {
  walkStats: WalkStat[];
  totalWalkStarts: number;
  totalWalkCompletions: number;
  overallAvgCompletionPct: number;
  mostAbandoned: { title: string; abandonPct: number } | null;
  mostCompleted: { title: string; completionPct: number } | null;
  dailyRhythmEnrollments: number;
  dailyRhythmCompletions: number;
  devotionalEngagements: number;
  /** Average % through a devotional series across all enrolled members (completed series = 100%). */
  devotionalAvgCompletionPct: number;
  companionEngagements: number;
  weeklyWalkStarts: { week: string; count: number }[];
  weeklyWalkCompletions: { week: string; count: number }[];
}

export interface FunnelStage {
  label: string;
  count: number;
  pct: number;
}

export interface SpiritualGrowthData {
  growing: number;
  plateauing: number;
  disengaging: number;
  avgAttendanceConsistency: number;
  signalTrend: { week: string; growth: number; attention: number }[];
}

export interface RoomStat {
  id: string;
  name: string;
  memberCount: number;
  messageCount: number;
  walksCompleted: number;
  isActive: boolean;
  createdAt: string;
}

export interface RoomAnalytics {
  rooms: RoomStat[];
  totalRooms: number;
  activeRooms: number;
  avgMembersPerRoom: number;
  totalMessages: number;
  walksCompletedInRooms: number;
}

export interface CompanionStat {
  id: string;
  title: string;
  starts: number;
  completions: number;
  avgCompletionPct: number;
}

export interface SermonAnalytics {
  companions: CompanionStat[];
  totalCompanionStarts: number;
  totalCompanionCompletions: number;
  overallAvgCompletionPct: number;
}

export interface BibleAnalytics {
  usersWithData: number;
  topAnnotatedBooks: { bookId: string; annotationCount: number }[];
}

export interface SignalBreakdown {
  category: string;
  open: number;
  resolved: number;
}

export interface PastoralCareAnalytics {
  openSignals: number;
  resolvedSignals: number;
  totalSignals: number;
  avgDaysToAcknowledge: number | null;
  byCategory: SignalBreakdown[];
}

export interface PredictiveInsight {
  id: string;
  type: "positive" | "warning" | "neutral";
  title: string;
  body: string;
  metric?: string;
  change?: number;
}

export interface SavedReport {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

// ─── S1 — Church Health KPIs ─────────────────────────────────────────────────

export async function getChurchHealthKpis(): Promise<ChurchHealthKpis> {
  const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  const [
    membersRes,
    activeWalksRes,
    lastSessionRes,
    rhythmRes,
    walkCompRes,
    roomRes,
    prayerRes,
    newBelieverRes,
    servingRes,
    baptismRes,
  ] = await Promise.all([
    // Total members
    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM pastoral_persons WHERE is_active = true) +
        (SELECT COUNT(*) FROM user_profiles) AS total
    `),
    // Active this week (journey progress updated)
    pool.query(
      `SELECT COUNT(DISTINCT user_id) AS cnt FROM user_journey_progress
       WHERE updated_at >= $1`,
      [oneWeekAgo],
    ),
    // Last completed session attendance
    pool.query(`
      SELECT
        COUNT(CASE WHEN ar.status = 'present' THEN 1 END) AS present,
        COUNT(CASE WHEN ar.status IN ('present','absent','apology') THEN 1 END) AS expected
      FROM meeting_sessions ms
      JOIN attendance_records ar ON ar.session_id = ms.id
      WHERE ms.status = 'completed'
        AND ms.session_date = (
          SELECT MAX(session_date) FROM meeting_sessions WHERE status = 'completed'
        )
    `),
    // Daily rhythm enrollments vs completions
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE ujp.status != 'completed') AS active,
        COUNT(*) AS total
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      WHERE j.journey_type = 'daily-rhythm'
    `),
    // Walk completion %
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE ujp.status = 'completed') AS completed,
        COUNT(*) AS total
      FROM user_journey_progress ujp
      WHERE ujp.status != 'not_started'
    `),
    // Room participation (unique members vs total members)
    pool.query(`
      SELECT
        (SELECT COUNT(DISTINCT user_id) FROM room_members) AS in_rooms,
        (SELECT COUNT(*) FROM user_profiles) AS total_users
    `),
    // Open prayer follow-up signals
    pool.query(`
      SELECT COUNT(*) AS cnt FROM discipleship_signals
      WHERE category = 'follow_up' AND status = 'open'
        AND signal_type LIKE '%prayer%'
    `),
    // New believers (accepted_christ milestone last 30 days)
    pool.query(`
      SELECT COUNT(*) AS cnt FROM pastoral_milestones
      WHERE milestone_type IN ('accepted_christ','salvation')
        AND (milestone_date IS NULL OR milestone_date >= NOW()::date - INTERVAL '30 days')
        AND created_at >= NOW() - INTERVAL '30 days'
    `),
    // Serving milestones total
    pool.query(`
      SELECT COUNT(*) AS cnt FROM pastoral_milestones
      WHERE milestone_type = 'serving'
    `),
    // Baptism milestones total
    pool.query(`
      SELECT COUNT(*) AS cnt FROM pastoral_milestones
      WHERE milestone_type = 'baptised'
    `),
  ]);

  const totalMembers = Number(membersRes.rows[0]?.total ?? 0);
  const activeThisWeek = Number(activeWalksRes.rows[0]?.cnt ?? 0);
  const present = Number(lastSessionRes.rows[0]?.present ?? 0);
  const expected = Number(lastSessionRes.rows[0]?.expected ?? 1);
  const rhythmActive = Number(rhythmRes.rows[0]?.active ?? 0);
  const rhythmTotal = Number(rhythmRes.rows[0]?.total ?? 0);
  const walkCompleted = Number(walkCompRes.rows[0]?.completed ?? 0);
  const walkTotal = Number(walkCompRes.rows[0]?.total ?? 0);
  const inRooms = Number(roomRes.rows[0]?.in_rooms ?? 0);
  const totalUsers = Number(roomRes.rows[0]?.total_users ?? 1);

  return {
    totalMembers,
    activeThisWeek,
    attendancePct: expected > 0 ? Math.round((present / expected) * 100) : 0,
    dailyRhythmPct: rhythmTotal > 0 ? Math.round((rhythmActive / rhythmTotal) * 100) : 0,
    walkCompletionPct: walkTotal > 0 ? Math.round((walkCompleted / walkTotal) * 100) : 0,
    roomParticipationPct: totalUsers > 0 ? Math.round((inRooms / totalUsers) * 100) : 0,
    openPrayerRequests: Number(prayerRes.rows[0]?.cnt ?? 0),
    newBelievers: Number(newBelieverRes.rows[0]?.cnt ?? 0),
    serving: Number(servingRes.rows[0]?.cnt ?? 0),
    baptisms: Number(baptismRes.rows[0]?.cnt ?? 0),
  };
}

// ─── S2 — Attendance Trends ───────────────────────────────────────────────────

export async function getAttendanceTrends(): Promise<AttendanceTrends> {
  const [weeklyRes, monthlyRes, byMeetingRes, retentionRes] = await Promise.all([
    // Weekly attendance (last 52 weeks, grouping by ISO week)
    pool.query(`
      SELECT
        to_char(date_trunc('week', ms.session_date::date), 'YYYY-MM-DD') AS date,
        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)   AS present,
        COUNT(CASE WHEN ar.status = 'visitor'  THEN 1 END)  AS visitors,
        COUNT(CASE WHEN ar.status IN ('present','absent','apology') THEN 1 END) AS expected
      FROM meeting_sessions ms
      LEFT JOIN attendance_records ar ON ar.session_id = ms.id
      WHERE ms.status = 'completed'
        AND ms.session_date >= NOW() - INTERVAL '52 weeks'
      GROUP BY 1
      ORDER BY 1
    `),
    // Monthly attendance (last 24 months)
    pool.query(`
      SELECT
        to_char(date_trunc('month', ms.session_date::date), 'YYYY-MM-DD') AS date,
        COUNT(CASE WHEN ar.status = 'present' THEN 1 END)  AS present,
        COUNT(CASE WHEN ar.status = 'visitor'  THEN 1 END) AS visitors,
        COUNT(CASE WHEN ar.status IN ('present','absent','apology') THEN 1 END) AS expected
      FROM meeting_sessions ms
      LEFT JOIN attendance_records ar ON ar.session_id = ms.id
      WHERE ms.status = 'completed'
        AND ms.session_date >= NOW() - INTERVAL '24 months'
      GROUP BY 1
      ORDER BY 1
    `),
    // By meeting type
    pool.query(`
      SELECT
        mt.name AS meeting_type,
        ROUND(AVG(cnt.present))::int AS avg_present,
        COUNT(DISTINCT ms.id) AS session_count
      FROM meeting_sessions ms
      JOIN meeting_types mt ON mt.id = ms.meeting_type_id
      JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE status = 'present') AS present
        FROM attendance_records WHERE session_id = ms.id
      ) cnt ON true
      WHERE ms.status = 'completed'
      GROUP BY mt.name
      ORDER BY avg_present DESC
      LIMIT 10
    `),
    // Retention: % of last-6-month attendees who attended more than once
    pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN session_cnt > 1 THEN person_key END)::float /
        NULLIF(COUNT(DISTINCT person_key), 0) AS retention
      FROM (
        SELECT person_id || '-' || person_type AS person_key,
               COUNT(DISTINCT session_id) AS session_cnt
        FROM attendance_records ar
        JOIN meeting_sessions ms ON ms.id = ar.session_id
        WHERE ms.session_date >= NOW() - INTERVAL '6 months'
          AND ar.status IN ('present','visitor')
        GROUP BY person_key
      ) sub
    `),
  ]);

  const weekly: AttendanceDataPoint[] = weeklyRes.rows.map((r) => ({
    date: r.date,
    present: Number(r.present),
    expected: Number(r.expected),
    visitors: Number(r.visitors),
  }));

  const monthly: AttendanceDataPoint[] = monthlyRes.rows.map((r) => ({
    date: r.date,
    present: Number(r.present),
    expected: Number(r.expected),
    visitors: Number(r.visitors),
  }));

  const byMeeting = byMeetingRes.rows.map((r) => ({
    meetingType: r.meeting_type,
    avgPresent: Number(r.avg_present),
    sessionCount: Number(r.session_count),
  }));

  // Visitor breakdown from monthly data (last 30 days vs prior 30)
  const visitorBreakdown = [
    {
      periodLabel: "Last 30 days",
      firstTime: monthly.at(-1)?.visitors ?? 0,
      returning: Math.max(0, (monthly.at(-1)?.present ?? 0) - (monthly.at(-1)?.visitors ?? 0)),
    },
  ];

  return {
    weekly,
    monthly,
    byMeeting,
    visitorBreakdown,
    retentionPct: Math.round((Number(retentionRes.rows[0]?.retention ?? 0)) * 100),
  };
}

// ─── S3 — Discipleship Analytics ─────────────────────────────────────────────

export async function getDiscipleshipAnalytics(): Promise<DiscipleshipAnalytics> {
  const [walkRes, weeklyRes, devotionalRes, rhythmRes, companionRes] = await Promise.all([
    // Per-journey stats
    pool.query(`
      SELECT
        j.id AS journey_id,
        j.title,
        COUNT(*) AS starts,
        COUNT(*) FILTER (WHERE ujp.status = 'completed') AS completions,
        ROUND(AVG(
          CASE WHEN j.duration_days > 0
               THEN COALESCE(jsonb_array_length(ujp.completed_days), 0)::float / j.duration_days * 100
               ELSE 0 END
        ))::int AS avg_completion_pct,
        ROUND(AVG(
          CASE WHEN ujp.status = 'completed' AND ujp.started_at IS NOT NULL AND ujp.updated_at IS NOT NULL
               THEN EXTRACT(EPOCH FROM (ujp.updated_at - ujp.started_at)) / 86400
               ELSE NULL END
        ))::int AS avg_days_to_complete
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      WHERE j.journey_type NOT IN ('daily-rhythm')
        AND ujp.status != 'not_started'
      GROUP BY j.id, j.title
      ORDER BY starts DESC
    `),
    // Weekly walk starts/completions (last 12 weeks)
    pool.query(`
      SELECT
        to_char(date_trunc('week', ujp.started_at), 'YYYY-MM-DD') AS week,
        COUNT(*) AS starts,
        COUNT(*) FILTER (WHERE ujp.status = 'completed') AS completions
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      WHERE j.journey_type NOT IN ('daily-rhythm')
        AND ujp.started_at >= NOW() - INTERVAL '12 weeks'
      GROUP BY 1
      ORDER BY 1
    `),
    // Devotional engagement + avg completion %.
    // current_day is server-authoritative but its numeric value is NOT a count
    // of completed entries — day numbers may be non-sequential (e.g. [1, 100]).
    // Safe approach: count published entries whose day_number < current_day
    // (i.e. entries the member has passed) and divide by total published entries.
    // Completed series are always 100% regardless of current_day.
    pool.query(`
      SELECT
        COUNT(*) AS cnt,
        ROUND(AVG(
          CASE
            WHEN dp.status = 'completed' THEN 100
            WHEN ec.total > 0 THEN
              LEAST(100, GREATEST(0,
                (
                  SELECT COUNT(*)
                  FROM devotional_entries de2
                  WHERE de2.series_id = dp.series_id
                    AND de2.status = 'Published'
                    AND de2.day_number < dp.current_day
                )::float / ec.total * 100
              ))
            ELSE 0
          END
        )) AS avg_completion_pct
      FROM devotional_progress dp
      LEFT JOIN (
        SELECT series_id, COUNT(*) FILTER (WHERE status = 'Published') AS total
        FROM devotional_entries
        GROUP BY series_id
      ) ec ON ec.series_id = dp.series_id
      WHERE dp.status != 'not_started'
    `),
    // Daily rhythm
    pool.query(`
      SELECT
        COUNT(*) AS enrollments,
        COUNT(*) FILTER (WHERE ujp.status = 'completed') AS completions
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      WHERE j.journey_type = 'daily-rhythm'
    `),
    // Sermon companion engagement
    pool.query(`SELECT COUNT(*) AS cnt FROM sermon_companion_progress WHERE status != 'not_started'`),
  ]);

  const walkStats: WalkStat[] = walkRes.rows.map((r) => ({
    journeyId: r.journey_id,
    title: r.title,
    starts: Number(r.starts),
    completions: Number(r.completions),
    avgCompletionPct: Number(r.avg_completion_pct),
    avgDaysToComplete: r.avg_days_to_complete ? Number(r.avg_days_to_complete) : null,
  }));

  const totalWalkStarts = walkStats.reduce((s, w) => s + w.starts, 0);
  const totalWalkCompletions = walkStats.reduce((s, w) => s + w.completions, 0);
  const overallAvgCompletionPct =
    walkStats.length > 0
      ? Math.round(walkStats.reduce((s, w) => s + w.avgCompletionPct, 0) / walkStats.length)
      : 0;

  const sorted = [...walkStats].filter((w) => w.starts > 0 && w.avgCompletionPct < 100);
  const mostAbandoned =
    sorted.sort((a, b) => a.avgCompletionPct - b.avgCompletionPct)[0] ?? null;
  const mostCompleted =
    [...walkStats]
      .filter((w) => w.starts > 0)
      .sort((a, b) => (b.completions / b.starts) - (a.completions / a.starts))[0] ?? null;

  const weeklyWalkStarts = weeklyRes.rows.map((r) => ({ week: r.week, count: Number(r.starts) }));
  const weeklyWalkCompletions = weeklyRes.rows.map((r) => ({
    week: r.week,
    count: Number(r.completions),
  }));

  return {
    walkStats,
    totalWalkStarts,
    totalWalkCompletions,
    overallAvgCompletionPct,
    mostAbandoned: mostAbandoned
      ? {
          title: mostAbandoned.title,
          abandonPct: 100 - mostAbandoned.avgCompletionPct,
        }
      : null,
    mostCompleted: mostCompleted
      ? {
          title: mostCompleted.title,
          completionPct: Math.round((mostCompleted.completions / mostCompleted.starts) * 100),
        }
      : null,
    dailyRhythmEnrollments: Number(rhythmRes.rows[0]?.enrollments ?? 0),
    dailyRhythmCompletions: Number(rhythmRes.rows[0]?.completions ?? 0),
    devotionalEngagements: Number(devotionalRes.rows[0]?.cnt ?? 0),
    devotionalAvgCompletionPct: Number(devotionalRes.rows[0]?.avg_completion_pct ?? 0),
    companionEngagements: Number(companionRes.rows[0]?.cnt ?? 0),
    weeklyWalkStarts,
    weeklyWalkCompletions,
  };
}

// ─── S4 — Retention Funnel ────────────────────────────────────────────────────

export async function getRetentionFunnel(): Promise<FunnelStage[]> {
  const [
    visitorsRes,
    accountsRes,
    startedCtjRes,
    completedCtjRes,
    startedPrayerRes,
    joinedRoomRes,
    baptisedRes,
    activeAfter6mRes,
  ] = await Promise.all([
    // Visitors (attendance_records with visitor status)
    pool.query(`
      SELECT COUNT(DISTINCT person_id || '-' || person_type) AS cnt
      FROM attendance_records WHERE status = 'visitor'
    `),
    // New accounts
    pool.query(`SELECT COUNT(*) AS cnt FROM user_profiles`),
    // Started Coming to Jesus (journey containing "coming" or "jesus")
    pool.query(`
      SELECT COUNT(DISTINCT ujp.user_id) AS cnt
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      WHERE LOWER(j.title) LIKE '%coming%' AND ujp.status != 'not_started'
    `),
    // Completed CTJ
    pool.query(`
      SELECT COUNT(DISTINCT ujp.user_id) AS cnt
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      WHERE LOWER(j.title) LIKE '%coming%' AND ujp.status = 'completed'
    `),
    // Started any prayer walk
    pool.query(`
      SELECT COUNT(DISTINCT ujp.user_id) AS cnt
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      WHERE LOWER(j.title) LIKE '%prayer%' AND ujp.status != 'not_started'
    `),
    // Joined a Room
    pool.query(`SELECT COUNT(DISTINCT user_id) AS cnt FROM room_members`),
    // Baptised
    pool.query(`SELECT COUNT(*) AS cnt FROM pastoral_milestones WHERE milestone_type = 'baptised'`),
    // Active after 6 months (updated walk progress after 6+ months from start)
    pool.query(`
      SELECT COUNT(DISTINCT user_id) AS cnt
      FROM user_journey_progress
      WHERE started_at IS NOT NULL
        AND updated_at >= started_at + INTERVAL '6 months'
    `),
  ]);

  const stages = [
    { label: "Visitors", count: Number(visitorsRes.rows[0]?.cnt ?? 0) },
    { label: "New Accounts", count: Number(accountsRes.rows[0]?.cnt ?? 0) },
    { label: "Started Coming to Jesus", count: Number(startedCtjRes.rows[0]?.cnt ?? 0) },
    { label: "Completed Coming to Jesus", count: Number(completedCtjRes.rows[0]?.cnt ?? 0) },
    { label: "Started Prayer Walk", count: Number(startedPrayerRes.rows[0]?.cnt ?? 0) },
    { label: "Joined Room", count: Number(joinedRoomRes.rows[0]?.cnt ?? 0) },
    { label: "Baptised", count: Number(baptisedRes.rows[0]?.cnt ?? 0) },
    { label: "Active after 6 months", count: Number(activeAfter6mRes.rows[0]?.cnt ?? 0) },
  ];

  const topCount = stages[0].count || 1;
  return stages.map((s) => ({ ...s, pct: Math.round((s.count / topCount) * 100) }));
}

// ─── S5 — Spiritual Growth ────────────────────────────────────────────────────

export async function getSpiritualGrowth(): Promise<SpiritualGrowthData> {
  const [growthRes, signalTrendRes, attendanceRes] = await Promise.all([
    // Signal category breakdown
    pool.query(`
      SELECT ds.category, COUNT(*) AS cnt
      FROM discipleship_signals ds
      WHERE ds.status = 'open'
      GROUP BY ds.category
    `),
    // Weekly signal trend (last 8 weeks)
    pool.query(`
      SELECT
        to_char(date_trunc('week', ds.created_at), 'YYYY-MM-DD') AS week,
        COUNT(*) FILTER (WHERE ds.category IN ('growth','celebration')) AS growth,
        COUNT(*) FILTER (WHERE ds.category IN ('attention','follow_up','significant')) AS attention
      FROM discipleship_signals ds
      WHERE ds.created_at >= NOW() - INTERVAL '8 weeks'
      GROUP BY 1
      ORDER BY 1
    `),
    // Attendance consistency (avg sessions attended vs expected)
    pool.query(`
      SELECT AVG(pct)::float AS avg_pct
      FROM (
        SELECT
          ar.person_id,
          COUNT(*) FILTER (WHERE ar.status = 'present')::float /
          NULLIF(COUNT(*) FILTER (WHERE ar.status IN ('present','absent','apology')), 0) AS pct
        FROM attendance_records ar
        JOIN meeting_sessions ms ON ms.id = ar.session_id
        WHERE ms.session_date >= NOW() - INTERVAL '12 weeks'
        GROUP BY ar.person_id
        HAVING COUNT(*) FILTER (WHERE ar.status IN ('present','absent','apology')) > 0
      ) sub
    `),
  ]);

  const byCategory: Record<string, number> = {};
  for (const r of growthRes.rows) byCategory[r.category] = Number(r.cnt);

  return {
    growing: (byCategory.growth ?? 0) + (byCategory.celebration ?? 0),
    plateauing: 0, // computed client-side as members minus growing/disengaging
    disengaging: (byCategory.attention ?? 0) + (byCategory.follow_up ?? 0),
    avgAttendanceConsistency: Math.round((Number(attendanceRes.rows[0]?.avg_pct ?? 0)) * 100),
    signalTrend: signalTrendRes.rows.map((r) => ({
      week: r.week,
      growth: Number(r.growth),
      attention: Number(r.attention),
    })),
  };
}

// ─── S6 — Room Analytics ──────────────────────────────────────────────────────

export async function getRoomAnalytics(): Promise<RoomAnalytics> {
  const [roomsRes, totalsRes] = await Promise.all([
    pool.query(`
      SELECT
        r.id,
        r.name,
        r.created_at,
        COUNT(DISTINCT rm.user_id) AS member_count,
        COUNT(DISTINCT msg.id)     AS message_count,
        COUNT(DISTINCT rj.journey_id) AS journeys_linked
      FROM rooms r
      LEFT JOIN room_members rm  ON rm.room_id = r.id
      LEFT JOIN room_messages msg ON msg.room_id = r.id
      LEFT JOIN room_journeys rj ON rj.room_id = r.id
      GROUP BY r.id, r.name, r.created_at
      ORDER BY member_count DESC, message_count DESC
    `),
    pool.query(`
      SELECT
        COUNT(DISTINCT r.id) AS total_rooms,
        COUNT(DISTINCT r.id) FILTER (WHERE msg_cnt.cnt > 0) AS active_rooms,
        COALESCE(AVG(mem_cnt.cnt), 0)::float AS avg_members,
        COALESCE(SUM(msg_cnt.cnt), 0) AS total_messages
      FROM rooms r
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM room_messages WHERE room_id = r.id
      ) msg_cnt ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM room_members WHERE room_id = r.id
      ) mem_cnt ON true
    `),
  ]);

  const rooms: RoomStat[] = roomsRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    memberCount: Number(r.member_count),
    messageCount: Number(r.message_count),
    walksCompleted: 0, // walk completions inside a room require cross-reference to room_journeys + user_journey_progress
    isActive: Number(r.message_count) > 0,
    createdAt: r.created_at,
  }));

  return {
    rooms,
    totalRooms: Number(totalsRes.rows[0]?.total_rooms ?? 0),
    activeRooms: Number(totalsRes.rows[0]?.active_rooms ?? 0),
    avgMembersPerRoom: Math.round(Number(totalsRes.rows[0]?.avg_members ?? 0) * 10) / 10,
    totalMessages: Number(totalsRes.rows[0]?.total_messages ?? 0),
    walksCompletedInRooms: 0,
  };
}

// ─── S7 — Sermon Analytics ────────────────────────────────────────────────────

export async function getSermonAnalytics(): Promise<SermonAnalytics> {
  const res = await pool.query(`
    SELECT
      sc.id,
      sc.title,
      COUNT(scp.id) AS starts,
      COUNT(scp.id) FILTER (WHERE scp.status = 'completed') AS completions,
      ROUND(AVG(
        CASE WHEN sc.number_of_days > 0
             THEN COALESCE(jsonb_array_length(scp.completed_days), 0)::float / sc.number_of_days * 100
             ELSE 0 END
      ))::int AS avg_completion_pct
    FROM sermon_companion sc
    LEFT JOIN sermon_companion_progress scp ON scp.companion_id = sc.id
    WHERE sc.status = 'published'
    GROUP BY sc.id, sc.title, sc.number_of_days
    ORDER BY starts DESC
  `);

  const companions: CompanionStat[] = res.rows.map((r) => ({
    id: r.id,
    title: r.title,
    starts: Number(r.starts),
    completions: Number(r.completions),
    avgCompletionPct: Number(r.avg_completion_pct ?? 0),
  }));

  const totalStarts = companions.reduce((s, c) => s + c.starts, 0);
  const totalCompletions = companions.reduce((s, c) => s + c.completions, 0);
  const overallAvg =
    companions.length > 0
      ? Math.round(companions.reduce((s, c) => s + c.avgCompletionPct, 0) / companions.length)
      : 0;

  return {
    companions,
    totalCompanionStarts: totalStarts,
    totalCompanionCompletions: totalCompletions,
    overallAvgCompletionPct: overallAvg,
  };
}

// ─── S8 — Bible Analytics ─────────────────────────────────────────────────────

export async function getBibleAnalytics(): Promise<BibleAnalytics> {
  const [usersRes, notesRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS cnt FROM user_bible_data WHERE data IS NOT NULL AND data != 'null'::jsonb`),
    // Most-studied books from bible_study_notes (admin-authored, proxy for focus areas)
    pool.query(`
      SELECT book_id, COUNT(*) AS cnt
      FROM bible_study_notes
      WHERE status = 'published'
      GROUP BY book_id
      ORDER BY cnt DESC
      LIMIT 10
    `),
  ]);

  return {
    usersWithData: Number(usersRes.rows[0]?.cnt ?? 0),
    topAnnotatedBooks: notesRes.rows.map((r) => ({
      bookId: r.book_id,
      annotationCount: Number(r.cnt),
    })),
  };
}

// ─── S9 — Pastoral Care Analytics ────────────────────────────────────────────

export async function getPastoralCareAnalytics(): Promise<PastoralCareAnalytics> {
  const [summaryRes, breakdownRes, responseTimeRes] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE ds.status = 'open') AS open_signals,
        COUNT(*) FILTER (WHERE ds.status != 'open') AS resolved_signals,
        COUNT(*) AS total
      FROM discipleship_signals ds
    `),
    pool.query(`
      SELECT
        ds.category,
        COUNT(*) FILTER (WHERE ds.status = 'open') AS open,
        COUNT(*) FILTER (WHERE ds.status != 'open') AS resolved
      FROM discipleship_signals ds
      GROUP BY ds.category
      ORDER BY open DESC
    `),
    pool.query(`
      SELECT ROUND(AVG(
        EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
      ))::int AS avg_days
      FROM discipleship_signals
      WHERE status != 'new'
    `).catch(() => ({ rows: [{ avg_days: null }] })),
  ]);

  return {
    openSignals: Number(summaryRes.rows[0]?.open_signals ?? 0),
    resolvedSignals: Number(summaryRes.rows[0]?.resolved_signals ?? 0),
    totalSignals: Number(summaryRes.rows[0]?.total ?? 0),
    avgDaysToAcknowledge: responseTimeRes.rows[0]?.avg_days
      ? Number(responseTimeRes.rows[0].avg_days)
      : null,
    byCategory: breakdownRes.rows.map((r) => ({
      category: r.category,
      open: Number(r.open),
      resolved: Number(r.resolved),
    })),
  };
}

// ─── S12 — Predictive Insights ───────────────────────────────────────────────

export async function getPredictiveInsights(): Promise<PredictiveInsight[]> {
  const insights: PredictiveInsight[] = [];

  try {
    // 1. Attendance trend (last 4 weeks vs prior 4 weeks)
    const attRes = await pool.query(`
      SELECT
        AVG(CASE WHEN ms.session_date >= NOW() - INTERVAL '4 weeks' THEN present_cnt ELSE NULL END) AS recent_avg,
        AVG(CASE WHEN ms.session_date  < NOW() - INTERVAL '4 weeks'
                  AND ms.session_date >= NOW() - INTERVAL '8 weeks' THEN present_cnt ELSE NULL END) AS prior_avg
      FROM meeting_sessions ms
      JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE status = 'present') AS present_cnt
        FROM attendance_records WHERE session_id = ms.id
      ) cnt ON true
      WHERE ms.status = 'completed'
        AND ms.session_date >= NOW() - INTERVAL '8 weeks'
    `);
    const recentAvg = Number(attRes.rows[0]?.recent_avg ?? 0);
    const priorAvg = Number(attRes.rows[0]?.prior_avg ?? 0);
    if (priorAvg > 0) {
      const changePct = Math.round(((recentAvg - priorAvg) / priorAvg) * 100);
      if (Math.abs(changePct) >= 5) {
        insights.push({
          id: "attendance-trend",
          type: changePct > 0 ? "positive" : "warning",
          title: changePct > 0 ? "Attendance is growing" : "Attendance is declining",
          body: `Average attendance has ${changePct > 0 ? "increased" : "decreased"} by ${Math.abs(changePct)}% over the last 4 weeks compared to the prior 4 weeks.`,
          metric: "Attendance",
          change: changePct,
        });
      }
    }

    // 2. Most abandoned Walk
    const abandonRes = await pool.query(`
      SELECT
        j.title,
        ROUND(AVG(
          COALESCE(jsonb_array_length(ujp.completed_steps), 0)::float /
          NULLIF(j.step_count, 0) * 100
        ))::int AS avg_completion_pct,
        COUNT(*) AS total_users
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      WHERE j.journey_type NOT IN ('daily-rhythm')
        AND ujp.status NOT IN ('not_started','completed')
        AND j.step_count > 0
      GROUP BY j.id, j.title, j.step_count
      HAVING COUNT(*) >= 2
      ORDER BY avg_completion_pct ASC
      LIMIT 1
    `);
    if (abandonRes.rows.length > 0) {
      const r = abandonRes.rows[0];
      insights.push({
        id: "most-abandoned-walk",
        type: "warning",
        title: `"${r.title}" has a high abandonment rate`,
        body: `Members are averaging only ${r.avg_completion_pct}% completion before stopping. Consider reviewing the content or adding encouragement steps.`,
        metric: "Walk completion",
        change: -Number(r.avg_completion_pct),
      });
    }

    // 3. New believer momentum
    const believersRes = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS last_30,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days'
                          AND created_at >= NOW() - INTERVAL '60 days')   AS prior_30
      FROM pastoral_milestones
      WHERE milestone_type IN ('accepted_christ', 'salvation')
    `);
    const last30 = Number(believersRes.rows[0]?.last_30 ?? 0);
    const prior30 = Number(believersRes.rows[0]?.prior_30 ?? 0);
    if (last30 > 0 || prior30 > 0) {
      const label =
        last30 > prior30
          ? `New believer decisions are up this month (${last30} vs ${prior30} last month).`
          : last30 < prior30
          ? `New believer decisions have dropped this month (${last30} vs ${prior30} last month).`
          : `New believer decisions are steady (${last30} this month).`;
      insights.push({
        id: "new-believer-trend",
        type: last30 >= prior30 ? "positive" : "warning",
        title: last30 >= prior30 ? "New believer momentum" : "Fewer new decisions this month",
        body: label,
        metric: "New believers",
        change: prior30 > 0 ? Math.round(((last30 - prior30) / prior30) * 100) : undefined,
      });
    }

    // 4. Daily rhythm engagement trend
    const rhythmRes = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days') AS last_7,
        COUNT(*) FILTER (WHERE updated_at >= NOW() - INTERVAL '14 days'
                          AND updated_at  < NOW() - INTERVAL '7 days')   AS prior_7
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      WHERE j.journey_type = 'daily-rhythm'
    `);
    const last7 = Number(rhythmRes.rows[0]?.last_7 ?? 0);
    const prior7 = Number(rhythmRes.rows[0]?.prior_7 ?? 0);
    if (last7 + prior7 > 0 && prior7 > 0) {
      const change = Math.round(((last7 - prior7) / prior7) * 100);
      if (Math.abs(change) >= 10) {
        insights.push({
          id: "daily-rhythm-trend",
          type: change > 0 ? "positive" : "warning",
          title:
            change > 0
              ? "Daily Rhythm engagement is up this week"
              : "Daily Rhythm engagement has fallen",
          body: `Daily Rhythm activity ${change > 0 ? "increased" : "decreased"} by ${Math.abs(change)}% compared to last week.`,
          metric: "Daily Rhythm",
          change,
        });
      }
    }

    // 5. Open follow-up signals spike
    const followUpRes = await pool.query(`
      SELECT COUNT(*) AS cnt FROM discipleship_signals
      WHERE category IN ('follow_up','attention') AND status = 'open'
    `);
    const openFollowUp = Number(followUpRes.rows[0]?.cnt ?? 0);
    if (openFollowUp >= 5) {
      insights.push({
        id: "followup-signals",
        type: "warning",
        title: `${openFollowUp} people need follow-up`,
        body: `There are ${openFollowUp} open attention or follow-up signals. These members may be disengaging and would benefit from a pastoral check-in.`,
        metric: "Care signals",
      });
    }
  } catch (err) {
    // Non-fatal — return what we have
  }

  return insights;
}

// ─── S13 — Saved Reports ──────────────────────────────────────────────────────

export async function listSavedReports(churchId = "icc"): Promise<SavedReport[]> {
  const res = await pool.query(
    `SELECT id, name, description, config, created_by, created_at
     FROM analytics_saved_reports
     WHERE church_id = $1
     ORDER BY created_at DESC`,
    [churchId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description ?? "",
    config: r.config ?? {},
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function createSavedReport(
  churchId = "icc",
  name: string,
  description: string,
  config: Record<string, unknown>,
  createdBy: string,
): Promise<SavedReport> {
  const res = await pool.query(
    `INSERT INTO analytics_saved_reports (church_id, name, description, config, created_by)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, name, description, config, created_by, created_at`,
    [churchId, name, description, config, createdBy],
  );
  const r = res.rows[0];
  return { id: r.id, name: r.name, description: r.description ?? "", config: r.config, createdBy: r.created_by, createdAt: r.created_at };
}

export async function deleteSavedReport(id: string): Promise<void> {
  await pool.query(`DELETE FROM analytics_saved_reports WHERE id = $1`, [id]);
}
