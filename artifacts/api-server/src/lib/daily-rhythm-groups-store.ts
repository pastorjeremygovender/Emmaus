import { pool } from "@workspace/db";

export type DailyRhythmGroupStep = {
  id: string;
  journeyId: string;
  day: number;
  title: string;
  scripture: string | null;
  displayLabel: string | null;
  status: string;
};

export type DailyRhythmGroup = {
  id: string;
  journeyId: string;
  title: string;
  description: string;
  status: string;
  displayOrder: number;
  items: DailyRhythmGroupStep[];
};

const stepFields = `
  s.id, s.journey_id AS "journeyId", s.day, s.title, s.scripture,
  s.display_label AS "displayLabel", s.status
`;

export async function listGroups(journeyId: string, publishedOnly: boolean): Promise<DailyRhythmGroup[]> {
  const groups = await pool.query(
    `SELECT id, journey_id AS "journeyId", title, description, status,
            display_order AS "displayOrder"
       FROM daily_rhythm_groups
      WHERE journey_id = $1 ${publishedOnly ? "AND status = 'Published'" : ""}
      ORDER BY display_order, title`,
    [journeyId],
  );
  if (groups.rows.length === 0) return [];
  const ids = groups.rows.map(row => row.id);
  const steps = await pool.query(
    `SELECT i.group_id AS "groupId", i.display_order AS "displayOrder", ${stepFields}
       FROM daily_rhythm_group_items i
       JOIN journey_steps s ON s.id = i.step_id
      WHERE i.group_id = ANY($1::uuid[])
        ${publishedOnly ? "AND s.status = 'Published'" : ""}
        AND s.deleted_at IS NULL AND s.is_completion_step = false
      ORDER BY i.display_order, s.day`,
    [ids],
  );
  const byGroup = new Map<string, DailyRhythmGroupStep[]>();
  for (const row of steps.rows) {
    const items = byGroup.get(row.groupId) ?? [];
    items.push({
      id: row.id,
      journeyId: row.journeyId,
      day: Number(row.day),
      title: row.title ?? "",
      scripture: row.scripture ?? null,
      displayLabel: row.displayLabel ?? null,
      status: row.status,
    });
    byGroup.set(row.groupId, items);
  }
  return groups.rows.map(row => ({ ...row, items: byGroup.get(row.id) ?? [] }));
}

export async function createGroup(journeyId: string, data: { title: string; description?: string; displayOrder?: number }) {
  const result = await pool.query(
    `INSERT INTO daily_rhythm_groups (journey_id, title, description, display_order)
     SELECT $1, $2, $3, $4
      WHERE EXISTS (SELECT 1 FROM journeys WHERE id = $1 AND journey_type = 'daily-rhythm')
     RETURNING id, journey_id AS "journeyId", title, description, status, display_order AS "displayOrder"`,
    [journeyId, data.title, data.description ?? "", data.displayOrder ?? 0],
  );
  return result.rows[0] ?? null;
}

export async function updateGroup(journeyId: string, groupId: string, data: Record<string, unknown>) {
  const fields: string[] = [];
  const values: unknown[] = [journeyId, groupId];
  for (const key of ["title", "description", "status", "display_order"]) {
    if (data[key] !== undefined) {
      values.push(data[key]);
      fields.push(`${key} = $${values.length}`);
    }
  }
  if (fields.length === 0) {
    const result = await pool.query(
      `SELECT id, journey_id AS "journeyId", title, description, status, display_order AS "displayOrder"
         FROM daily_rhythm_groups WHERE journey_id = $1 AND id = $2`,
      values.slice(0, 2),
    );
    return result.rows[0] ?? null;
  }
  fields.push("updated_at = NOW()");
  const result = await pool.query(
    `UPDATE daily_rhythm_groups SET ${fields.join(", ")}
      WHERE journey_id = $1 AND id = $2
      RETURNING id, journey_id AS "journeyId", title, description, status, display_order AS "displayOrder"`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function deleteGroup(journeyId: string, groupId: string) {
  const result = await pool.query(
    `DELETE FROM daily_rhythm_groups WHERE journey_id = $1 AND id = $2 RETURNING id`,
    [journeyId, groupId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function replaceGroupItems(journeyId: string, groupId: string, stepIds: string[]) {
  const uniqueIds = [...new Set(stepIds)];
  const valid = await pool.query(
    `SELECT s.id FROM journey_steps s
      JOIN journeys j ON j.id = s.journey_id
     WHERE s.journey_id = $1 AND j.journey_type = 'daily-rhythm'
       AND s.id = ANY($2::uuid[]) AND s.deleted_at IS NULL AND s.is_completion_step = false`,
    [journeyId, uniqueIds],
  );
  if (valid.rows.length !== uniqueIds.length) throw new Error("Every grouped day must belong to the Daily Rhythm journey");
  const group = await pool.query(
    `SELECT id FROM daily_rhythm_groups WHERE id = $1 AND journey_id = $2`,
    [groupId, journeyId],
  );
  if (!group.rows[0]) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM daily_rhythm_group_items WHERE group_id = $1`, [groupId]);
    for (let i = 0; i < uniqueIds.length; i++) {
      await client.query(
        `INSERT INTO daily_rhythm_group_items (group_id, step_id, display_order) VALUES ($1, $2, $3)`,
        [groupId, uniqueIds[i], i],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return (await listGroups(journeyId, false)).find(item => item.id === groupId) ?? null;
}