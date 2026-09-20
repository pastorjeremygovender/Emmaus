/**
 * pastor-name.ts — single source of truth for the pastoral display name
 * returned by the API to member-facing surfaces.
 *
 * Use PASTOR_DISPLAY_NAME everywhere a pastor name is returned to members:
 *   - Sermon speaker fields in API responses
 *   - Ask Emmaus context assembly
 *   - Default speaker on auto-approved videos
 *
 * DO NOT use this for:
 *   - Database IDs or author identifiers
 *   - YouTube video titles (leave as-is from YouTube source)
 *   - Internal analytics or admin-only fields
 */
export const PASTOR_DISPLAY_NAME = 'Pastor Jeremy';
