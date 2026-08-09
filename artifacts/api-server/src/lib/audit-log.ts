/**
 * audit-log.ts — Shared helper for writing content audit events.
 *
 * Every admin mutation that creates, edits, publishes, unpublishes, archives,
 * soft-deletes, permanently-deletes, or restores authored content should call
 * logAuditEvent. The function never throws — a failure to write an audit row
 * must never block the primary action.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";

export type AuditAction =
  | "create"
  | "edit"
  | "publish"
  | "unpublish"
  | "archive"
  | "delete"           // soft delete (deleted_at set, data preserved)
  | "permanent_delete" // irreversible hard delete
  | "restore";

export type AuditContentType =
  | "journey"
  | "journey_step"
  | "devotional_series"
  | "devotional_entry"
  | "sermon_companion"
  | "sermon_companion_entry"
  | "room"
  /** Changes to user-level permissions (e.g. Authorized Group Leader toggle) */
  | "user_permission";

export interface AuditEventParams {
  contentType: AuditContentType;
  contentId: string;
  action: AuditAction;
  performedBy: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
}

/**
 * Write a single audit row to content_audit_log.
 *
 * Failures are swallowed and logged at ERROR level — the audit system must
 * never block or roll back a primary content operation.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO content_audit_log
         (content_type, content_id, action, performed_by, previous_state, new_state)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        params.contentType,
        params.contentId,
        params.action,
        params.performedBy,
        params.previousState != null ? JSON.stringify(params.previousState) : null,
        params.newState != null ? JSON.stringify(params.newState) : null,
      ],
    );
  } catch (err) {
    logger.error(
      { err, contentType: params.contentType, contentId: params.contentId, action: params.action },
      "audit-log: failed to write audit event (non-fatal)",
    );
  }
}
