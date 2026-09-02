/**
 * dashboard-store.ts — Data layer for the Pastoral Dashboard (Checkpoint 5).
 *
 * Each exported function is a single focused aggregate. The routes call them
 * independently so that one slow aggregate never blocks the rest.
 *
 * Empty tables return valid empty/zero data. Query failures propagate so the
 * route and UI can distinguish failure from an empty result.
 */

import { pool } from "@workspace/db";

export const CHURCH_ID = "icc";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TodayStats {
  attendance: { present: number; expected: number; sessionCount: number };
  activeWalks: number;
  activeDevotionals: number;
  devotionalActivityToday: number;
  newPeopleThisWeek: { pastoralPersons: number; emmausAccounts: number };
  followUpSignalCount: number;
}

export interface MovementCard {
  id: string;
  label: string;
  count: number;
  sublabel?: string;
}

export interface AttendancePoint {
  date: string;
  present: number;
  expected: number;
  meetingType: string;
}

export interface TimeSeriesPoint {
  date: string;
  count: number;
}

export interface EngagementData {
  attendanceLast12: AttendancePoint[];
  devotionalLast30: TimeSeriesPoint[];
  walkStartsLast90: TimeSeriesPoint[];
  walkCompletionsLast90: TimeSeriesPoint[];
  roomJoinsLast90: TimeSeriesPoint[];
}

export interface NewBeliever {
  userId: string;
  personName: string;
  journeyTitle: string;
  completedAt: string;
  hasBaptism: boolean;
  hasRoom: boolean;
}

export interface ActivityItem {
  id: string;
  type: string;
  personName: string;
  detail: string;
  eventAt: string;
}

// ─── Today Stats ─────────────────────────────────────────────────────────────

export async function getTodayStats(): Promise<TodayStats> {
  const [attRes, walksRes, devRes, devTodayRes, newPpRes, newEuRes, followUpRes] =
    await Promise.all([
      // Today's attendance
      pool.query<{ present: string; expected: string; session_count: string }>(`
        SELECT
          COUNT(CASE WHEN ar.status IN ('present','visitor') THEN 1 END)::text AS present,
          COUNT(CASE WHEN ar.status != 'not_expected'        THEN 1 END)::text AS expected,
          COUNT(DISTINCT ms.id)::text AS session_count
        FROM meeting_sessions ms
        JOIN attendance_records ar ON ar.session_id = ms.id
        WHERE ms.session_date = CURRENT_DATE
          AND ms.church_id = $1
      `, [CHURCH_ID]),

      // Active walks
      pool.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM user_journey_progress
        WHERE status NOT IN ('completed')
      `),

      // Active devotionals (any progress record not completed)
      pool.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM devotional_progress
        WHERE status NOT IN ('completed')
      `),

      // Devotional activity today (distinct users)
      pool.query<{ count: string }>(`
        SELECT COUNT(DISTINCT user_id)::text AS count
        FROM devotional_progress
        WHERE DATE(updated_at) = CURRENT_DATE
      `),

      // New pastoral persons this week
      pool.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM pastoral_persons
        WHERE church_id = $1
          AND created_at >= CURRENT_DATE - INTERVAL '7 days'
      `, [CHURCH_ID]),

      // New emmaus accounts this week
      pool.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM user_profiles up
        INNER JOIN users u ON u.id = up.auth_subject
        WHERE u.created_at >= CURRENT_DATE - INTERVAL '7 days'
          AND up.account_status = 'active'
      `),

      // Open follow-up / significant signals
      pool.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM discipleship_signals
        WHERE church_id = $1
          AND category IN ('follow_up','significant')
          AND status NOT IN ('resolved','dismissed')
      `, [CHURCH_ID]),
    ]);

  const att = attRes.rows[0];
  const n = (r: { rows: { count: string }[] }) => Number(r.rows[0]?.count ?? 0);

  return {
    attendance: {
      present:      Number(att?.present ?? 0),
      expected:     Number(att?.expected ?? 0),
      sessionCount: Number(att?.session_count ?? 0),
    },
    activeWalks:            n(walksRes),
    activeDevotionals:      n(devRes),
    devotionalActivityToday: n(devTodayRes),
    newPeopleThisWeek: {
      pastoralPersons: n(newPpRes),
      emmausAccounts:  n(newEuRes),
    },
    followUpSignalCount: n(followUpRes),
  };
}

// ─── Discipleship Movement (this calendar month) ─────────────────────────────

export async function getDiscipleshipMovement(): Promise<MovementCard[]> {
  const monthStart = `DATE_TRUNC('month', CURRENT_DATE)`;

  const results = await Promise.all([
    // Started walks this month
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM user_journey_progress
      WHERE started_at >= ${monthStart} AND started_at IS NOT NULL
    `),
    // Completed walks this month
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM user_journey_progress
      WHERE last_completed_at >= ${monthStart} AND status = 'completed'
    `),
    // Joined rooms this month
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM room_members
      WHERE joined_at >= ${monthStart}
    `),
    // Started devotionals this month
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM devotional_progress
      WHERE started_at >= ${monthStart} AND started_at IS NOT NULL
    `),
    // Completed devotionals this month
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM devotional_progress
      WHERE updated_at >= ${monthStart} AND status = 'completed'
    `),
    // Baptised this month
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM pastoral_milestones
      WHERE church_id = $1 AND milestone_type = 'baptised' AND is_active = true
        AND (milestone_date >= ${monthStart} OR created_at >= ${monthStart})
    `, [CHURCH_ID]),
    // Accepted Christ this month
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM pastoral_milestones
      WHERE church_id = $1 AND milestone_type = 'accepted_christ' AND is_active = true
        AND (milestone_date >= ${monthStart} OR created_at >= ${monthStart})
    `, [CHURCH_ID]),
    // Significant signals this month
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM discipleship_signals
      WHERE church_id = $1 AND category = 'significant'
        AND detected_at >= ${monthStart}
    `, [CHURCH_ID]),
  ]);

  const n = (idx: number) => Number(results[idx].rows[0]?.count ?? 0);

  return [
    { id: "walks_started",    label: "Walks Started",     count: n(0) },
    { id: "walks_completed",  label: "Walks Completed",   count: n(1) },
    { id: "rooms_joined",     label: "Rooms Joined",      count: n(2) },
    { id: "rhythm_started",   label: "Daily Rhythm Started", count: n(3) },
    { id: "rhythm_completed", label: "Rhythm Completed",  count: n(4) },
    { id: "baptised",         label: "Baptised",          count: n(5) },
    { id: "accepted_christ",  label: "Accepted Christ",   count: n(6) },
    { id: "significant",      label: "Significant Moments", count: n(7) },
  ];
}

// ─── Engagement Chart Data ────────────────────────────────────────────────────

export async function getEngagementData(): Promise<EngagementData> {
  const [attRes, devRes, walkStartRes, walkComplRes, roomRes] = await Promise.all([
    // Attendance last 12 sessions (any type)
    pool.query<{ date: string; present: string; expected: string; meeting_type: string }>(`
      SELECT ms.session_date::text AS date,
             mt.name AS meeting_type,
             COUNT(CASE WHEN ar.status IN ('present','visitor') THEN 1 END)::text AS present,
             COUNT(CASE WHEN ar.status != 'not_expected' THEN 1 END)::text AS expected
      FROM meeting_sessions ms
      JOIN meeting_types mt ON mt.id = ms.meeting_type_id
      LEFT JOIN attendance_records ar ON ar.session_id = ms.id
      WHERE ms.church_id = $1 AND ms.status = 'completed'
      GROUP BY ms.session_date, mt.name
      ORDER BY ms.session_date DESC
      LIMIT 12
    `, [CHURCH_ID]),

    // Daily rhythm activity last 30 days
    pool.query<{ date: string; count: string }>(`
      SELECT DATE(updated_at)::text AS date,
             COUNT(DISTINCT user_id)::text AS count
      FROM devotional_progress
      WHERE updated_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(updated_at)
      ORDER BY date
    `),

    // Walk starts per week (last 90 days)
    pool.query<{ date: string; count: string }>(`
      SELECT DATE_TRUNC('week', started_at)::date::text AS date,
             COUNT(*)::text AS count
      FROM user_journey_progress
      WHERE started_at >= CURRENT_DATE - INTERVAL '90 days'
        AND started_at IS NOT NULL
      GROUP BY DATE_TRUNC('week', started_at)
      ORDER BY date
    `),

    // Walk completions per week (last 90 days)
    pool.query<{ date: string; count: string }>(`
      SELECT DATE_TRUNC('week', last_completed_at)::date::text AS date,
             COUNT(*)::text AS count
      FROM user_journey_progress
      WHERE last_completed_at >= CURRENT_DATE - INTERVAL '90 days'
        AND status = 'completed'
      GROUP BY DATE_TRUNC('week', last_completed_at)
      ORDER BY date
    `),

    // Room joins per week (last 90 days)
    pool.query<{ date: string; count: string }>(`
      SELECT DATE_TRUNC('week', joined_at)::date::text AS date,
             COUNT(*)::text AS count
      FROM room_members
      WHERE joined_at >= CURRENT_DATE - INTERVAL '90 days'
        AND joined_at IS NOT NULL
      GROUP BY DATE_TRUNC('week', joined_at)
      ORDER BY date
    `),
  ]);

  const toPoints = (r: { rows: { date: string; count: string }[] }) =>
    r.rows.map((x) => ({ date: x.date, count: Number(x.count) }));

  const attRows = attRes.rows
    .reverse() // oldest first for chart
    .map((r) => ({
      date: r.date,
      present:  Number(r.present),
      expected: Number(r.expected),
      meetingType: r.meeting_type,
    }));

  return {
    attendanceLast12:      attRows,
    devotionalLast30:      toPoints(devRes),
    walkStartsLast90:      toPoints(walkStartRes),
    walkCompletionsLast90: toPoints(walkComplRes),
    roomJoinsLast90:       toPoints(roomRes),
  };
}

// ─── New Believers ────────────────────────────────────────────────────────────

export async function getNewBelievers(): Promise<NewBeliever[]> {
  // People who completed a journey containing "coming to jesus" in the last 60 days
  const res = await pool.query<{
    user_id: string;
    person_name: string;
    journey_title: string;
    completed_at: string;
  }>(`
    SELECT ujp.user_id,
           COALESCE(up.preferred_name, ujp.user_id) AS person_name,
           j.title AS journey_title,
           ujp.last_completed_at::text AS completed_at
    FROM user_journey_progress ujp
    JOIN journeys j ON j.id = ujp.journey_id
    LEFT JOIN user_profiles up
      ON up.auth_subject = ujp.user_id OR up.email = ujp.user_id
    WHERE ujp.status = 'completed'
      AND ujp.last_completed_at >= CURRENT_DATE - INTERVAL '60 days'
      AND (j.title ILIKE '%coming to jesus%' OR j.title ILIKE '%made free%'
           OR j.title ILIKE '%salvation%' OR j.title ILIKE '%prayer walk%')
    ORDER BY ujp.last_completed_at DESC
    LIMIT 20
  `);

  // Check baptism milestones + room membership for each
  const believers = await Promise.all(
    res.rows.map(async (r) => {
      const [baptRes, roomRes] = await Promise.all([
        pool.query(
          `SELECT 1 FROM pastoral_milestones pm
           JOIN pastoral_persons pp ON pp.id::text = pm.person_id
           WHERE pm.church_id = $1 AND pm.milestone_type = 'baptised'
              AND pm.is_active = true AND pp.linked_user_id = $2
           LIMIT 1`,
          [CHURCH_ID, r.user_id],
        ),
        pool.query(
          `SELECT 1 FROM room_members WHERE user_id = $1 LIMIT 1`,
          [r.user_id],
        ),
      ]);

      return {
        userId:       r.user_id,
        personName:   r.person_name,
        journeyTitle: r.journey_title,
        completedAt:  r.completed_at,
         hasBaptism:   baptRes.rows.length > 0,
         hasRoom:      roomRes.rows.length > 0,
      };
    }),
  );

  return believers;
}

// ─── Recent Activity ──────────────────────────────────────────────────────────

export async function getRecentActivity(limit = 25): Promise<ActivityItem[]> {
  const res = await pool.query<{
    id: string; type: string; person_name: string; detail: string; event_at: string;
  }>(`
    SELECT id, type, person_name, detail, event_at FROM (

      -- Walk progress
      SELECT ujp.user_id || '-walk-' || j.id AS id,
             'walk_progress' AS type,
             COALESCE(up.preferred_name, ujp.user_id) AS person_name,
             CASE WHEN ujp.status = 'completed'
               THEN 'Completed "' || j.title || '"'
               ELSE 'Working through "' || j.title || '"'
             END AS detail,
             ujp.updated_at::text AS event_at
      FROM user_journey_progress ujp
      JOIN journeys j ON j.id = ujp.journey_id
      LEFT JOIN user_profiles up
        ON up.auth_subject = ujp.user_id OR up.email = ujp.user_id
      WHERE ujp.updated_at >= CURRENT_DATE - INTERVAL '14 days'

      UNION ALL

      -- Room joins
      SELECT rm.user_id || '-room-' || rm.room_id::text AS id,
             'room_join' AS type,
             COALESCE(up.preferred_name, rm.user_id) AS person_name,
             'Joined "' || r.name || '"' AS detail,
             rm.joined_at::text AS event_at
      FROM room_members rm
      JOIN rooms r ON r.id = rm.room_id
      LEFT JOIN user_profiles up
        ON up.auth_subject = rm.user_id OR up.email = rm.user_id
      WHERE rm.joined_at >= CURRENT_DATE - INTERVAL '14 days'

      UNION ALL

      -- Milestones
      SELECT pm.id::text AS id,
             'milestone' AS type,
             COALESCE(pp.full_name, pm.person_id) AS person_name,
             INITCAP(REPLACE(pm.milestone_type,'_',' ')) || ' milestone recorded' AS detail,
             pm.created_at::text AS event_at
      FROM pastoral_milestones pm
      LEFT JOIN pastoral_persons pp ON pp.id::text = pm.person_id
      WHERE pm.church_id = $1
        AND pm.is_active = true
        AND pm.created_at >= CURRENT_DATE - INTERVAL '14 days'

      UNION ALL

      -- Attendance records (attendances recorded today or recent sessions)
      SELECT ar.id::text AS id,
             'attendance' AS type,
             COALESCE(pp.full_name, eu.preferred_name, ar.person_id) AS person_name,
             CASE ar.status
               WHEN 'present' THEN 'Attended ' || mt.name
               WHEN 'visitor' THEN 'Visited ' || mt.name
               WHEN 'absent'  THEN 'Missed ' || mt.name
               ELSE INITCAP(ar.status) || ' at ' || mt.name
             END AS detail,
             ms.session_date::text || 'T00:00:00Z' AS event_at
      FROM attendance_records ar
      JOIN meeting_sessions ms ON ms.id = ar.session_id
      JOIN meeting_types mt    ON mt.id = ms.meeting_type_id
      LEFT JOIN pastoral_persons pp ON pp.id::text = ar.person_id
      LEFT JOIN user_profiles eu
        ON eu.auth_subject = ar.person_id OR eu.email = ar.person_id
      WHERE ms.church_id = $1
        AND ms.session_date >= CURRENT_DATE - INTERVAL '14 days'
        AND ar.status IN ('present','visitor')

    ) sub
    ORDER BY event_at DESC
    LIMIT $2
  `, [CHURCH_ID, limit]);

  return res.rows.map((r) => ({
    id:         r.id,
    type:       r.type,
    personName: r.person_name,
    detail:     r.detail,
    eventAt:    r.event_at,
  }));
}
