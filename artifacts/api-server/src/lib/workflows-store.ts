/**
 * workflows-store.ts — PostgreSQL access layer for Pastoral Workflows (CP7).
 *
 * Covers: ministry_tasks, task_templates, pastoral_workflow_notes.
 *
 * All mutations honour church_id = 'icc' for tenant isolation.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";

export const CHURCH_ID = "icc";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "waiting"
  | "completed"
  | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskSource =
  | "care_signal"
  | "manual"
  | "attendance"
  | "walk"
  | "prayer_request";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface MinistryTask {
  id: string;
  churchId: string;
  title: string;
  reason: string;
  personId: string | null;
  personType: string | null;
  source: TaskSource;
  priority: TaskPriority;
  assignedTo: string | null;
  dueDate: string | null;
  status: TaskStatus;
  notes: string;
  team: string;
  checklist: ChecklistItem[];
  signalId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface TaskTemplate {
  id: string;
  churchId: string;
  name: string;
  category: string;
  defaultTitle: string;
  suggestedQuestions: string[];
  bibleRef: string;
  prayerReminder: string;
  checklist: { id: string; label: string }[];
  isSystem: boolean;
  createdBy: string;
  createdAt: string;
}

export interface WorkflowNote {
  id: string;
  churchId: string;
  personId: string | null;
  personType: string | null;
  taskId: string | null;
  content: string;
  isConfidential: boolean;
  authorId: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rowToTask(r: Record<string, unknown>): MinistryTask {
  return {
    id: r.id as string,
    churchId: r.church_id as string,
    title: r.title as string,
    reason: (r.reason as string) ?? "",
    personId: (r.person_id as string | null) ?? null,
    personType: (r.person_type as string | null) ?? null,
    source: (r.source as TaskSource) ?? "manual",
    priority: (r.priority as TaskPriority) ?? "normal",
    assignedTo: (r.assigned_to as string | null) ?? null,
    dueDate: r.due_date ? String(r.due_date).slice(0, 10) : null,
    status: (r.status as TaskStatus) ?? "new",
    notes: (r.notes as string) ?? "",
    team: (r.team as string) ?? "",
    checklist: (r.checklist as ChecklistItem[]) ?? [],
    signalId: (r.signal_id as string | null) ?? null,
    createdBy: (r.created_by as string) ?? "",
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    archivedAt: (r.archived_at as string | null) ?? null,
  };
}

function rowToTemplate(r: Record<string, unknown>): TaskTemplate {
  return {
    id: r.id as string,
    churchId: r.church_id as string,
    name: r.name as string,
    category: (r.category as string) ?? "",
    defaultTitle: (r.default_title as string) ?? "",
    suggestedQuestions: (r.suggested_questions as string[]) ?? [],
    bibleRef: (r.bible_ref as string) ?? "",
    prayerReminder: (r.prayer_reminder as string) ?? "",
    checklist: (r.checklist as { id: string; label: string }[]) ?? [],
    isSystem: Boolean(r.is_system),
    createdBy: (r.created_by as string) ?? "system",
    createdAt: r.created_at as string,
  };
}

function rowToNote(r: Record<string, unknown>): WorkflowNote {
  return {
    id: r.id as string,
    churchId: r.church_id as string,
    personId: (r.person_id as string | null) ?? null,
    personType: (r.person_type as string | null) ?? null,
    taskId: (r.task_id as string | null) ?? null,
    content: r.content as string,
    isConfidential: Boolean(r.is_confidential),
    authorId: (r.author_id as string) ?? "",
    createdAt: r.created_at as string,
  };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export interface ListTasksFilter {
  status?: TaskStatus | "active"; // 'active' = new|assigned|in_progress|waiting
  assignedTo?: string;
  personId?: string;
  personType?: string;
  team?: string;
  includeArchived?: boolean;
  priority?: TaskPriority;
  overdueOnly?: boolean;
}

export async function listTasks(
  filter: ListTasksFilter = {},
): Promise<MinistryTask[]> {
  const conditions: string[] = ["church_id = $1"];
  const values: unknown[] = [CHURCH_ID];
  let i = 2;

  if (!filter.includeArchived) conditions.push("archived_at IS NULL");

  if (filter.status === "active") {
    conditions.push(`status IN ('new','assigned','in_progress','waiting')`);
  } else if (filter.status) {
    conditions.push(`status = $${i++}`);
    values.push(filter.status);
  }

  if (filter.assignedTo) {
    conditions.push(`assigned_to = $${i++}`);
    values.push(filter.assignedTo);
  }
  if (filter.personId) {
    conditions.push(`person_id = $${i++}`);
    values.push(filter.personId);
    if (filter.personType) {
      conditions.push(`person_type = $${i++}`);
      values.push(filter.personType);
    }
  }
  if (filter.team) {
    conditions.push(`team = $${i++}`);
    values.push(filter.team);
  }
  if (filter.priority) {
    conditions.push(`priority = $${i++}`);
    values.push(filter.priority);
  }
  if (filter.overdueOnly) {
    conditions.push(`due_date < NOW()::date AND status NOT IN ('completed','cancelled')`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM ministry_tasks WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       due_date NULLS LAST,
       created_at DESC`,
    values,
  );
  return rows.map(rowToTask);
}

export async function getTask(id: string): Promise<MinistryTask | null> {
  const { rows } = await pool.query(
    `SELECT * FROM ministry_tasks WHERE id = $1 AND church_id = $2`,
    [id, CHURCH_ID],
  );
  return rows[0] ? rowToTask(rows[0]) : null;
}

export async function createTask(data: {
  title: string;
  reason?: string;
  personId?: string;
  personType?: string;
  source?: TaskSource;
  priority?: TaskPriority;
  assignedTo?: string;
  dueDate?: string;
  status?: TaskStatus;
  notes?: string;
  team?: string;
  checklist?: ChecklistItem[];
  signalId?: string;
  createdBy: string;
}): Promise<MinistryTask> {
  const {
    title, reason = "", personId, personType,
    source = "manual", priority = "normal",
    assignedTo, dueDate, status = "new",
    notes = "", team = "", checklist = [], signalId, createdBy,
  } = data;

  // If assigned, auto-promote status
  const resolvedStatus: TaskStatus =
    status === "new" && assignedTo ? "assigned" : status;

  const { rows } = await pool.query(
    `INSERT INTO ministry_tasks
       (church_id, title, reason, person_id, person_type, source, priority,
        assigned_to, due_date, status, notes, team, checklist, signal_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      CHURCH_ID, title, reason, personId ?? null, personType ?? null,
      source, priority, assignedTo ?? null,
      dueDate ?? null, resolvedStatus, notes, team,
      JSON.stringify(checklist), signalId ?? null, createdBy,
    ],
  );
  return rowToTask(rows[0]);
}

export async function updateTask(
  id: string,
  data: Partial<{
    title: string;
    reason: string;
    personId: string | null;
    personType: string | null;
    source: TaskSource;
    priority: TaskPriority;
    assignedTo: string | null;
    dueDate: string | null;
    status: TaskStatus;
    notes: string;
    team: string;
    checklist: ChecklistItem[];
  }>,
): Promise<MinistryTask | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  const fieldMap: Record<string, string> = {
    title: "title", reason: "reason", personId: "person_id",
    personType: "person_type", source: "source", priority: "priority",
    assignedTo: "assigned_to", dueDate: "due_date", status: "status",
    notes: "notes", team: "team",
  };

  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in data) {
      sets.push(`${col} = $${i++}`);
      values.push((data as Record<string, unknown>)[key] ?? null);
    }
  }
  if ("checklist" in data) {
    sets.push(`checklist = $${i++}`);
    values.push(JSON.stringify(data.checklist));
  }

  if (sets.length === 0) return getTask(id);

  sets.push(`updated_at = NOW()`);
  values.push(id, CHURCH_ID);

  const { rows } = await pool.query(
    `UPDATE ministry_tasks SET ${sets.join(", ")}
     WHERE id = $${i++} AND church_id = $${i++}
     RETURNING *`,
    values,
  );
  return rows[0] ? rowToTask(rows[0]) : null;
}

export async function archiveTask(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE ministry_tasks SET archived_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND church_id = $2`,
    [id, CHURCH_ID],
  );
  return (rowCount ?? 0) > 0;
}

// ─── Leader view ──────────────────────────────────────────────────────────────

export interface LeaderView {
  myTasks: MinistryTask[];
  overdue: MinistryTask[];
  dueToday: MinistryTask[];
  dueTomorrow: MinistryTask[];
  upcoming: MinistryTask[];
}

export async function getLeaderView(assignedTo: string): Promise<LeaderView> {
  const all = await listTasks({ assignedTo, status: "active" });

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const overdue = all.filter((t) => t.dueDate && t.dueDate < today);
  const dueToday = all.filter((t) => t.dueDate === today);
  const dueTomorrow = all.filter((t) => t.dueDate === tomorrow);
  const upcoming = all.filter(
    (t) => !t.dueDate || t.dueDate > tomorrow,
  );

  return { myTasks: all, overdue, dueToday, dueTomorrow, upcoming };
}

// ─── Pastor view ──────────────────────────────────────────────────────────────

export interface PastorView {
  unassigned: MinistryTask[];
  overdue: MinistryTask[];
  allActive: MinistryTask[];
  recentlyCompleted: MinistryTask[];
  workloadByLeader: { leader: string; count: number }[];
  workloadByTeam: { team: string; count: number }[];
  stats: {
    totalActive: number;
    totalOverdue: number;
    totalUnassigned: number;
    completedThisWeek: number;
  };
}

export async function getPastorView(): Promise<PastorView> {
  const today = new Date().toISOString().slice(0, 10);

  const [activeRows, recentRows, workloadLeader, workloadTeam] =
    await Promise.all([
      pool.query(
        `SELECT * FROM ministry_tasks
         WHERE church_id = $1 AND archived_at IS NULL
           AND status IN ('new','assigned','in_progress','waiting')
         ORDER BY
           CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
           due_date NULLS LAST`,
        [CHURCH_ID],
      ),
      pool.query(
        `SELECT * FROM ministry_tasks
         WHERE church_id = $1 AND status = 'completed'
           AND updated_at >= NOW() - INTERVAL '14 days'
         ORDER BY updated_at DESC LIMIT 20`,
        [CHURCH_ID],
      ),
      pool.query(
        `SELECT assigned_to AS leader, COUNT(*) AS count
         FROM ministry_tasks
         WHERE church_id = $1 AND archived_at IS NULL AND assigned_to IS NOT NULL
           AND status IN ('new','assigned','in_progress','waiting')
         GROUP BY assigned_to ORDER BY count DESC`,
        [CHURCH_ID],
      ),
      pool.query(
        `SELECT team, COUNT(*) AS count
         FROM ministry_tasks
         WHERE church_id = $1 AND archived_at IS NULL AND team != ''
           AND status IN ('new','assigned','in_progress','waiting')
         GROUP BY team ORDER BY count DESC`,
        [CHURCH_ID],
      ),
    ]);

  const allActive = activeRows.rows.map(rowToTask);
  const unassigned = allActive.filter((t) => !t.assignedTo);
  const overdue = allActive.filter((t) => t.dueDate && t.dueDate < today);

  return {
    unassigned,
    overdue,
    allActive,
    recentlyCompleted: recentRows.rows.map(rowToTask),
    workloadByLeader: workloadLeader.rows.map((r) => ({
      leader: r.leader,
      count: Number(r.count),
    })),
    workloadByTeam: workloadTeam.rows.map((r) => ({
      team: r.team,
      count: Number(r.count),
    })),
    stats: {
      totalActive: allActive.length,
      totalOverdue: overdue.length,
      totalUnassigned: unassigned.length,
      completedThisWeek: 0, // filled below
    },
  };
}

// ─── Care signal → task suggestions ──────────────────────────────────────────

export interface TaskSuggestion {
  signalId: string;
  personId: string;
  personType: string;
  category: string;
  description: string;
  suggestedTitle: string;
  suggestedPriority: TaskPriority;
}

export async function getSignalSuggestions(): Promise<TaskSuggestion[]> {
  const { rows } = await pool.query(
    `SELECT ds.id, ds.person_id, ds.person_type, ds.category, ds.explanation AS description
     FROM discipleship_signals ds
     WHERE ds.church_id = $1
       AND ds.status = 'open'
       AND NOT EXISTS (
         SELECT 1 FROM ministry_tasks mt
         WHERE mt.signal_id = ds.id AND mt.archived_at IS NULL
       )
     ORDER BY
       CASE ds.category
         WHEN 'significant' THEN 0 WHEN 'attention' THEN 1
         WHEN 'follow_up' THEN 2 ELSE 3 END,
       ds.created_at DESC
     LIMIT 20`,
    [CHURCH_ID],
  );

  return rows.map((r) => {
    const priority: TaskPriority =
      r.category === "significant" || r.category === "attention"
        ? "high"
        : "normal";
    const titleMap: Record<string, string> = {
      significant: "Pastoral Follow-up",
      attention: "Pastoral Check-in",
      follow_up: "Follow-up Visit",
      celebration: "Celebration Check-in",
      growth: "Encouragement Visit",
    };
    return {
      signalId: r.id,
      personId: r.person_id,
      personType: r.person_type,
      category: r.category,
      description: r.description ?? "",
      suggestedTitle: titleMap[r.category] ?? "Pastoral Visit",
      suggestedPriority: priority,
    };
  });
}

// ─── Templates ────────────────────────────────────────────────────────────────

const SYSTEM_TEMPLATES: Omit<TaskTemplate, "id" | "churchId" | "createdAt">[] = [
  {
    name: "New Believer",
    category: "evangelism",
    defaultTitle: "New Believer Follow-up",
    suggestedQuestions: [
      "How did you come to faith?",
      "Do you have a Bible?",
      "Have you told anyone about your decision?",
      "Would you like to join a discipleship walk?",
    ],
    bibleRef: "2 Corinthians 5:17",
    prayerReminder: "Pray for assurance of salvation and a strong start in faith.",
    checklist: [
      { id: "nb1", label: "First contact made" },
      { id: "nb2", label: "Bible given or arranged" },
      { id: "nb3", label: "Discipleship Walk introduced" },
      { id: "nb4", label: "Room or small group invited" },
      { id: "nb5", label: "Follow-up scheduled" },
    ],
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "Hospital Visit",
    category: "pastoral_care",
    defaultTitle: "Hospital Visit",
    suggestedQuestions: [
      "How are you feeling today?",
      "Is there anything the church can help with?",
      "Have family been able to visit?",
      "Would you like me to pray with you?",
    ],
    bibleRef: "Psalm 23:4",
    prayerReminder: "Pray for healing, peace and the presence of God.",
    checklist: [
      { id: "hv1", label: "Visit completed" },
      { id: "hv2", label: "Prayer offered" },
      { id: "hv3", label: "Family contacted" },
      { id: "hv4", label: "Practical needs assessed" },
      { id: "hv5", label: "Follow-up arranged" },
    ],
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "Bereavement",
    category: "pastoral_care",
    defaultTitle: "Bereavement Support",
    suggestedQuestions: [
      "How are you coping day to day?",
      "Do you have family supporting you?",
      "Would you like someone to sit with you?",
      "Are there practical needs we can help with?",
    ],
    bibleRef: "Revelation 21:4",
    prayerReminder: "Pray for comfort, peace and the hope of resurrection.",
    checklist: [
      { id: "be1", label: "Initial contact made" },
      { id: "be2", label: "Practical support offered" },
      { id: "be3", label: "Prayer offered" },
      { id: "be4", label: "Funeral support discussed" },
      { id: "be5", label: "Ongoing check-in scheduled" },
    ],
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "Attendance Follow-up",
    category: "discipleship",
    defaultTitle: "Attendance Follow-up",
    suggestedQuestions: [
      "We've missed you — how are you doing?",
      "Is there anything we can pray for?",
      "Has anything changed in your circumstances?",
      "Is there anything that made it hard to come?",
    ],
    bibleRef: "Hebrews 10:25",
    prayerReminder: "Pray that they feel known and welcomed back.",
    checklist: [
      { id: "af1", label: "Contact made (call/visit)" },
      { id: "af2", label: "Reason for absence noted (if shared)" },
      { id: "af3", label: "Prayer offered" },
      { id: "af4", label: "Re-engagement encouraged" },
    ],
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "Prayer Request",
    category: "prayer",
    defaultTitle: "Prayer Request Follow-up",
    suggestedQuestions: [
      "How is the situation you asked prayer for?",
      "Have you seen any answers to prayer?",
      "Would you like us to continue praying?",
    ],
    bibleRef: "Philippians 4:6",
    prayerReminder: "Follow up on the original request and pray with them again.",
    checklist: [
      { id: "pr1", label: "Request received and recorded" },
      { id: "pr2", label: "Prayer offered" },
      { id: "pr3", label: "Follow-up check-in completed" },
    ],
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "Volunteer Conversation",
    category: "ministry",
    defaultTitle: "Volunteer Conversation",
    suggestedQuestions: [
      "What areas of ministry interest you?",
      "What gifts or skills do you feel you have?",
      "What days or times work best for you?",
      "Is there a team you'd like to learn more about?",
    ],
    bibleRef: "1 Peter 4:10",
    prayerReminder: "Pray for wisdom in matching gifts to ministry needs.",
    checklist: [
      { id: "vc1", label: "Gifts discussed" },
      { id: "vc2", label: "Ministry areas introduced" },
      { id: "vc3", label: "Team leader introduced or assigned" },
      { id: "vc4", label: "Start date or next step agreed" },
    ],
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "Marriage Preparation",
    category: "pastoral_care",
    defaultTitle: "Marriage Preparation Session",
    suggestedQuestions: [
      "How long have you been together?",
      "Have you discussed finances, family and faith expectations?",
      "What are your hopes for your marriage?",
      "Are there any areas you'd like support in?",
    ],
    bibleRef: "Ephesians 5:25",
    prayerReminder: "Pray for a Christ-centred, loving and lasting marriage.",
    checklist: [
      { id: "mp1", label: "Initial meeting completed" },
      { id: "mp2", label: "Pre-marriage course discussed" },
      { id: "mp3", label: "Ceremony details confirmed" },
      { id: "mp4", label: "Counselling sessions scheduled" },
      { id: "mp5", label: "Post-wedding follow-up planned" },
    ],
    isSystem: true,
    createdBy: "system",
  },
  {
    name: "Baptism Conversation",
    category: "evangelism",
    defaultTitle: "Baptism Conversation",
    suggestedQuestions: [
      "What does baptism mean to you?",
      "Tell me about your faith journey.",
      "Have you shared your faith story with others?",
      "Are you ready to make a public declaration of faith?",
    ],
    bibleRef: "Romans 6:4",
    prayerReminder: "Pray for clarity, conviction and a powerful testimony.",
    checklist: [
      { id: "bc1", label: "Faith story heard" },
      { id: "bc2", label: "Baptism explained" },
      { id: "bc3", label: "Date confirmed" },
      { id: "bc4", label: "Family invited" },
      { id: "bc5", label: "Post-baptism discipleship discussed" },
    ],
    isSystem: true,
    createdBy: "system",
  },
];

export async function ensureSystemTemplates(): Promise<void> {
  for (const tmpl of SYSTEM_TEMPLATES) {
    try {
      await pool.query(
        `INSERT INTO task_templates
           (church_id, name, category, default_title, suggested_questions,
            bible_ref, prayer_reminder, checklist, is_system, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (church_id, name) DO NOTHING`,
        [
          CHURCH_ID, tmpl.name, tmpl.category, tmpl.defaultTitle,
          tmpl.suggestedQuestions, tmpl.bibleRef, tmpl.prayerReminder,
          JSON.stringify(tmpl.checklist), tmpl.isSystem, tmpl.createdBy,
        ],
      );
    } catch (err) {
      logger.warn({ err, name: tmpl.name }, "Failed to seed task template");
    }
  }
}

export async function listTemplates(): Promise<TaskTemplate[]> {
  const { rows } = await pool.query(
    `SELECT * FROM task_templates WHERE church_id = $1 ORDER BY is_system DESC, name ASC`,
    [CHURCH_ID],
  );
  return rows.map(rowToTemplate);
}

export async function createTemplate(data: {
  name: string;
  category?: string;
  defaultTitle?: string;
  suggestedQuestions?: string[];
  bibleRef?: string;
  prayerReminder?: string;
  checklist?: { id: string; label: string }[];
  createdBy: string;
}): Promise<TaskTemplate> {
  const {
    name, category = "", defaultTitle = "", suggestedQuestions = [],
    bibleRef = "", prayerReminder = "", checklist = [], createdBy,
  } = data;
  const { rows } = await pool.query(
    `INSERT INTO task_templates
       (church_id, name, category, default_title, suggested_questions,
        bible_ref, prayer_reminder, checklist, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      CHURCH_ID, name, category, defaultTitle, suggestedQuestions,
      bibleRef, prayerReminder, JSON.stringify(checklist), createdBy,
    ],
  );
  return rowToTemplate(rows[0]);
}

export async function updateTemplate(
  id: string,
  data: Partial<Omit<TaskTemplate, "id" | "churchId" | "createdAt" | "createdBy" | "isSystem">>,
): Promise<TaskTemplate | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (data.name !== undefined) { sets.push(`name = $${i++}`); values.push(data.name); }
  if (data.category !== undefined) { sets.push(`category = $${i++}`); values.push(data.category); }
  if (data.defaultTitle !== undefined) { sets.push(`default_title = $${i++}`); values.push(data.defaultTitle); }
  if (data.suggestedQuestions !== undefined) { sets.push(`suggested_questions = $${i++}`); values.push(data.suggestedQuestions); }
  if (data.bibleRef !== undefined) { sets.push(`bible_ref = $${i++}`); values.push(data.bibleRef); }
  if (data.prayerReminder !== undefined) { sets.push(`prayer_reminder = $${i++}`); values.push(data.prayerReminder); }
  if (data.checklist !== undefined) { sets.push(`checklist = $${i++}`); values.push(JSON.stringify(data.checklist)); }

  if (sets.length === 0) {
    const { rows } = await pool.query(`SELECT * FROM task_templates WHERE id = $1`, [id]);
    return rows[0] ? rowToTemplate(rows[0]) : null;
  }

  values.push(id, CHURCH_ID);
  const { rows } = await pool.query(
    `UPDATE task_templates SET ${sets.join(", ")} WHERE id = $${i++} AND church_id = $${i++} AND is_system = false RETURNING *`,
    values,
  );
  return rows[0] ? rowToTemplate(rows[0]) : null;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM task_templates WHERE id = $1 AND church_id = $2 AND is_system = false`,
    [id, CHURCH_ID],
  );
  return (rowCount ?? 0) > 0;
}

// ─── Pastoral Workflow Notes ───────────────────────────────────────────────────

export async function listNotes(filter: {
  personId?: string;
  personType?: string;
  taskId?: string;
  includeConfidential?: boolean;
}): Promise<WorkflowNote[]> {
  const conds: string[] = ["church_id = $1"];
  const vals: unknown[] = [CHURCH_ID];
  let i = 2;

  if (!filter.includeConfidential) {
    conds.push(`is_confidential = false`);
  }
  if (filter.personId) {
    conds.push(`person_id = $${i++}`);
    vals.push(filter.personId);
    if (filter.personType) {
      conds.push(`person_type = $${i++}`);
      vals.push(filter.personType);
    }
  }
  if (filter.taskId) {
    conds.push(`task_id = $${i++}`);
    vals.push(filter.taskId);
  }

  const { rows } = await pool.query(
    `SELECT * FROM pastoral_workflow_notes WHERE ${conds.join(" AND ")} ORDER BY created_at DESC`,
    vals,
  );
  return rows.map(rowToNote);
}

export async function createNote(data: {
  personId?: string;
  personType?: string;
  taskId?: string;
  content: string;
  isConfidential?: boolean;
  authorId: string;
}): Promise<WorkflowNote> {
  const { rows } = await pool.query(
    `INSERT INTO pastoral_workflow_notes
       (church_id, person_id, person_type, task_id, content, is_confidential, author_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      CHURCH_ID, data.personId ?? null, data.personType ?? null,
      data.taskId ?? null, data.content,
      data.isConfidential ?? false, data.authorId,
    ],
  );
  return rowToNote(rows[0]);
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  kind: "task" | "note";
  id: string;
  title: string;
  excerpt: string;
  personId: string | null;
  personType: string | null;
  status?: string;
  createdAt: string;
}

export async function searchWorkflows(q: string): Promise<SearchResult[]> {
  const like = `%${q.toLowerCase()}%`;
  const [taskRows, noteRows] = await Promise.all([
    pool.query(
      `SELECT id, title, reason, notes, person_id, person_type, status, created_at
       FROM ministry_tasks
       WHERE church_id = $1 AND archived_at IS NULL
         AND (LOWER(title) LIKE $2 OR LOWER(reason) LIKE $2 OR LOWER(notes) LIKE $2)
       ORDER BY created_at DESC LIMIT 20`,
      [CHURCH_ID, like],
    ),
    pool.query(
      `SELECT id, content, person_id, person_type, created_at
       FROM pastoral_workflow_notes
       WHERE church_id = $1 AND is_confidential = false AND LOWER(content) LIKE $2
       ORDER BY created_at DESC LIMIT 20`,
      [CHURCH_ID, like],
    ),
  ]);

  const tasks: SearchResult[] = taskRows.rows.map((r) => ({
    kind: "task",
    id: r.id,
    title: r.title,
    excerpt: r.reason || r.notes || "",
    personId: r.person_id,
    personType: r.person_type,
    status: r.status,
    createdAt: r.created_at,
  }));
  const notes: SearchResult[] = noteRows.rows.map((r) => ({
    kind: "note",
    id: r.id,
    title: "Pastoral Note",
    excerpt: r.content.slice(0, 120),
    personId: r.person_id,
    personType: r.person_type,
    createdAt: r.created_at,
  }));

  return [...tasks, ...notes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface WorkflowReports {
  totalCompleted: number;
  completedThisWeek: number;
  completedThisMonth: number;
  avgDaysToComplete: number | null;
  outstanding: number;
  overdueCount: number;
  bySource: { source: string; count: number }[];
  byTeam: { team: string; count: number }[];
  byLeader: { leader: string; completed: number; active: number }[];
}

export async function getWorkflowReports(): Promise<WorkflowReports> {
  const [totals, bySource, byTeam, byLeader] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') AS total_completed,
         COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= NOW() - INTERVAL '7 days') AS completed_week,
         COUNT(*) FILTER (WHERE status = 'completed' AND updated_at >= NOW() - INTERVAL '30 days') AS completed_month,
         ROUND(AVG(
           CASE WHEN status = 'completed'
                THEN EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400
                ELSE NULL END
         ))::int AS avg_days,
         COUNT(*) FILTER (WHERE status IN ('new','assigned','in_progress','waiting') AND archived_at IS NULL) AS outstanding,
         COUNT(*) FILTER (WHERE due_date < NOW()::date AND status NOT IN ('completed','cancelled') AND archived_at IS NULL) AS overdue
       FROM ministry_tasks WHERE church_id = $1`,
      [CHURCH_ID],
    ),
    pool.query(
      `SELECT source, COUNT(*) AS count FROM ministry_tasks
       WHERE church_id = $1 GROUP BY source ORDER BY count DESC`,
      [CHURCH_ID],
    ),
    pool.query(
      `SELECT team, COUNT(*) AS count FROM ministry_tasks
       WHERE church_id = $1 AND team != '' GROUP BY team ORDER BY count DESC`,
      [CHURCH_ID],
    ),
    pool.query(
      `SELECT assigned_to AS leader,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status IN ('new','assigned','in_progress','waiting')) AS active
       FROM ministry_tasks
       WHERE church_id = $1 AND assigned_to IS NOT NULL
       GROUP BY assigned_to ORDER BY completed DESC`,
      [CHURCH_ID],
    ),
  ]);

  const t = totals.rows[0];
  return {
    totalCompleted: Number(t?.total_completed ?? 0),
    completedThisWeek: Number(t?.completed_week ?? 0),
    completedThisMonth: Number(t?.completed_month ?? 0),
    avgDaysToComplete: t?.avg_days != null ? Number(t.avg_days) : null,
    outstanding: Number(t?.outstanding ?? 0),
    overdueCount: Number(t?.overdue ?? 0),
    bySource: bySource.rows.map((r) => ({ source: r.source, count: Number(r.count) })),
    byTeam: byTeam.rows.map((r) => ({ team: r.team, count: Number(r.count) })),
    byLeader: byLeader.rows.map((r) => ({
      leader: r.leader,
      completed: Number(r.completed),
      active: Number(r.active),
    })),
  };
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo: string | null;
  personId: string | null;
  personType: string | null;
  team: string;
}

export async function getCalendarEvents(
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const { rows } = await pool.query(
    `SELECT id, title, due_date, priority, status, assigned_to, person_id, person_type, team
     FROM ministry_tasks
     WHERE church_id = $1
       AND due_date >= $2::date AND due_date <= $3::date
       AND archived_at IS NULL
     ORDER BY due_date, priority`,
    [CHURCH_ID, from, to],
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: String(r.due_date).slice(0, 10),
    priority: r.priority,
    status: r.status,
    assignedTo: r.assigned_to,
    personId: r.person_id,
    personType: r.person_type,
    team: r.team ?? "",
  }));
}
