import { pool } from "@workspace/db";
import { CHURCH_ID, logPastoralAudit } from "./pastoral-store.js";
import {
  BRIEFING_DEFAULTS,
  countConsecutiveMissed,
  evaluatePastoralBriefing,
  type BriefingPersonRecord,
  type EvaluatedBriefingPerson,
  type PastoralBriefingRules,
} from "./pastoral-briefing.js";

export type StoredPastoralBriefingRules = PastoralBriefingRules & {
  updatedAt: string | null;
  updatedBy: string | null;
  source: "saved" | "defaults";
};

type RulesRow = Record<string, unknown>;

export async function getPastoralBriefingRules(): Promise<StoredPastoralBriefingRules> {
  const result = await pool.query(
    `SELECT *
       FROM pastoral_briefing_rules
      WHERE church_id = $1`,
    [CHURCH_ID],
  );
  const row = result.rows[0] as RulesRow | undefined;
  if (!row) {
    return { ...BRIEFING_DEFAULTS, updatedAt: null, updatedBy: null, source: "defaults" };
  }
  return rowToRules(row);
}

export async function savePastoralBriefingRules(
  rules: PastoralBriefingRules,
  changedBy: string,
  action = "update",
): Promise<StoredPastoralBriefingRules> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const previous = await client.query(
      `SELECT *
         FROM pastoral_briefing_rules
        WHERE church_id = $1
        FOR UPDATE`,
      [CHURCH_ID],
    );
    await client.query(
      `INSERT INTO pastoral_briefing_rules (
         church_id,
         attendance_alerts_enabled, missed_services_threshold,
         emmaus_inactivity_alerts_enabled, emmaus_inactivity_days,
         stalled_progress_alerts_enabled, stalled_progress_days,
         new_user_grace_period_days,
         exclude_test_accounts, exclude_inactive_accounts, exclude_visitors,
         exclude_unlinked_profiles, exclude_church_administrators,
         exclude_without_active_identity, updated_by, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()
       )
       ON CONFLICT (church_id) DO UPDATE SET
         attendance_alerts_enabled = EXCLUDED.attendance_alerts_enabled,
         missed_services_threshold = EXCLUDED.missed_services_threshold,
         emmaus_inactivity_alerts_enabled = EXCLUDED.emmaus_inactivity_alerts_enabled,
         emmaus_inactivity_days = EXCLUDED.emmaus_inactivity_days,
         stalled_progress_alerts_enabled = EXCLUDED.stalled_progress_alerts_enabled,
         stalled_progress_days = EXCLUDED.stalled_progress_days,
         new_user_grace_period_days = EXCLUDED.new_user_grace_period_days,
         exclude_test_accounts = EXCLUDED.exclude_test_accounts,
         exclude_inactive_accounts = EXCLUDED.exclude_inactive_accounts,
         exclude_visitors = EXCLUDED.exclude_visitors,
         exclude_unlinked_profiles = EXCLUDED.exclude_unlinked_profiles,
         exclude_church_administrators = EXCLUDED.exclude_church_administrators,
         exclude_without_active_identity = EXCLUDED.exclude_without_active_identity,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [
        CHURCH_ID,
        rules.attendanceAlertsEnabled,
        rules.missedServicesThreshold,
        rules.emmausInactivityAlertsEnabled,
        rules.emmausInactivityDays,
        rules.stalledProgressAlertsEnabled,
        rules.stalledProgressDays,
        rules.newUserGracePeriodDays,
        rules.excludeTestAccounts,
        rules.excludeInactiveAccounts,
        rules.excludeVisitors,
        rules.excludeUnlinkedProfiles,
        rules.excludeChurchAdministrators,
        rules.excludeWithoutActiveIdentity,
        changedBy,
      ],
    );
    const saved = await client.query(
      `SELECT * FROM pastoral_briefing_rules WHERE church_id = $1`,
      [CHURCH_ID],
    );
    await client.query("COMMIT");

    await logPastoralAudit({
      entityType: "pastoral_briefing_rules",
      entityId: CHURCH_ID,
      action,
      previousValue: previous.rows[0] ? rowToRules(previous.rows[0] as RulesRow) : BRIEFING_DEFAULTS,
      newValue: rules,
      changedBy,
    });
    return rowToRules(saved.rows[0] as RulesRow);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function restorePastoralBriefingDefaults(
  changedBy: string,
): Promise<StoredPastoralBriefingRules> {
  return savePastoralBriefingRules(BRIEFING_DEFAULTS, changedBy, "restore_defaults");
}

export async function evaluateCurrentPastoralBriefing(
  rules: PastoralBriefingRules,
): Promise<EvaluatedBriefingPerson[]> {
  const people = await loadBriefingPeople();
  return evaluatePastoralBriefing(rules, people);
}

export async function loadBriefingPeople(): Promise<BriefingPersonRecord[]> {
  const [peopleRes, activityRes, attendanceRes, stalledRes] = await Promise.all([
    pool.query(
      `SELECT
         u.id AS person_id, 'emmaus_user' AS person_type,
         COALESCE(NULLIF(up.preferred_name, ''), NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS person_name,
          u.email, u.created_at, NULL::text AS linked_user_id,
          up.app_role, up.account_status,
         true AS is_linked, true AS has_active_identity, false AS is_visitor
       FROM users u
       JOIN user_profiles up ON up.auth_subject = u.id
       WHERE up.account_status = 'active'
      UNION ALL
      SELECT
         pp.id::text AS person_id, 'pastoral_person' AS person_type,
         pp.full_name AS person_name, pp.email, pp.created_at,
          up.auth_subject AS linked_user_id, up.app_role, up.account_status,
         (up.auth_subject IS NOT NULL AND up.account_status = 'active') AS is_linked,
         (up.auth_subject IS NOT NULL AND up.account_status = 'active') AS has_active_identity,
         (pp.person_type = 'visitor') AS is_visitor
       FROM pastoral_persons pp
       LEFT JOIN user_profiles up ON up.auth_subject = pp.linked_user_id
       WHERE pp.church_id = $1 AND pp.is_active = true`,
      [CHURCH_ID],
    ),
    pool.query(
      `SELECT u.id AS person_id, MAX(activity.activity_at) AS last_activity_at
         FROM users u
         JOIN user_profiles up ON up.auth_subject = u.id
         LEFT JOIN LATERAL (
           SELECT ujp.updated_at AS activity_at
             FROM user_journey_progress ujp
             JOIN journeys j ON j.id = ujp.journey_id
            WHERE ujp.user_id = u.id AND j.status = 'Published'
           UNION ALL
           SELECT sr.updated_at
             FROM step_reflections sr
            WHERE sr.user_id = u.id
           UNION ALL
           SELECT dp.updated_at
             FROM devotional_progress dp
            WHERE dp.user_id = u.id
         ) activity ON true
        WHERE up.account_status = 'active'
        GROUP BY u.id`,
    ),
    pool.query(
       `SELECT
           ae.person_id::text AS person_id,
           ae.person_type,
           ms.session_date,
           ms.id AS session_id,
           CASE WHEN COALESCE(ar.status, 'absent') IN ('present','visitor','apology')
                THEN false ELSE true END AS missed
         FROM person_attendance_expectations ae
         JOIN meeting_sessions ms ON ms.meeting_type_id = ae.meeting_type_id
           AND ms.church_id = ae.church_id
           AND ms.status = 'completed'
           AND ms.session_date <= CURRENT_DATE
         JOIN meeting_types mt ON mt.id = ms.meeting_type_id
           AND mt.track_attendance = true
           AND mt.care_signal_enabled = true
         LEFT JOIN attendance_records ar
           ON ar.session_id = ms.id
          AND ar.person_id = ae.person_id
          AND ar.person_type = ae.person_type
         WHERE ae.church_id = $1
           AND ae.expectation = 'expected'
         ORDER BY ae.person_type, ae.person_id, ms.session_date DESC, ms.id DESC`,
      [CHURCH_ID],
    ),
    pool.query(
      `SELECT
         ujp.user_id AS person_id,
         j.title,
         ujp.updated_at AS last_activity_at
       FROM user_journey_progress ujp
       JOIN journeys j ON j.id = ujp.journey_id
      WHERE ujp.status = 'active'
        AND j.status = 'Published'
        AND COALESCE(j.journey_type, 'walk') <> 'daily-rhythm'`,
    ),
  ]);

  const activityByUser = new Map<string, string | null>(
    activityRes.rows.map(row => [String(row.person_id), row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null]),
  );
  const attendanceStatusesByPerson = new Map<string, boolean[]>();
  for (const row of attendanceRes.rows) {
    const key = `${row.person_type}:${row.person_id}`;
    const statuses = attendanceStatusesByPerson.get(key) ?? [];
    if (statuses.length < 12) statuses.push(Boolean(row.missed));
    attendanceStatusesByPerson.set(key, statuses);
  }
  const attendanceByPerson = new Map(
    [...attendanceStatusesByPerson.entries()].map(([key, statuses]) => [
      key,
      countConsecutiveMissed(statuses),
    ]),
  );
  const stalledByUser = new Map<string, Array<{ title: string; lastActivityAt: string | null }>>();
  for (const row of stalledRes.rows) {
    const key = String(row.person_id);
    const entries = stalledByUser.get(key) ?? [];
    entries.push({
      title: String(row.title ?? "Walk or Journey"),
      lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
    });
    stalledByUser.set(key, entries);
  }

  return peopleRes.rows.map(row => {
    const personId = String(row.person_id);
    const personType = String(row.person_type) as BriefingPersonRecord["personType"];
    const key = `${personType}:${personId}`;
    const linkedUserId = personType === "emmaus_user"
      ? personId
      : row.linked_user_id
        ? String(row.linked_user_id)
        : null;
    return {
      personId,
      personType,
      personName: String(row.person_name ?? ""),
      email: row.email ? String(row.email) : null,
      linkedUserId,
      accountRole: row.app_role ? String(row.app_role) as BriefingPersonRecord["accountRole"] : null,
      accountStatus: row.account_status ? String(row.account_status) as BriefingPersonRecord["accountStatus"] : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      lastActivityAt: linkedUserId ? activityByUser.get(linkedUserId) ?? null : null,
      isVisitor: Boolean(row.is_visitor),
      isLinked: Boolean(row.is_linked),
      hasActiveIdentity: Boolean(row.has_active_identity),
      missedServices: attendanceByPerson.get(key) ?? 0,
      stalledJourneys: linkedUserId ? stalledByUser.get(linkedUserId) ?? [] : [],
    };
  });
}

function rowToRules(row: RulesRow): StoredPastoralBriefingRules {
  return {
    attendanceAlertsEnabled: Boolean(row.attendance_alerts_enabled),
    missedServicesThreshold: Number(row.missed_services_threshold),
    emmausInactivityAlertsEnabled: Boolean(row.emmaus_inactivity_alerts_enabled),
    emmausInactivityDays: Number(row.emmaus_inactivity_days),
    stalledProgressAlertsEnabled: Boolean(row.stalled_progress_alerts_enabled),
    stalledProgressDays: Number(row.stalled_progress_days),
    newUserGracePeriodDays: Number(row.new_user_grace_period_days),
    excludeTestAccounts: Boolean(row.exclude_test_accounts),
    excludeInactiveAccounts: Boolean(row.exclude_inactive_accounts),
    excludeVisitors: Boolean(row.exclude_visitors),
    excludeUnlinkedProfiles: Boolean(row.exclude_unlinked_profiles),
    excludeChurchAdministrators: Boolean(row.exclude_church_administrators),
    excludeWithoutActiveIdentity: Boolean(row.exclude_without_active_identity),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    source: "saved",
  };
}