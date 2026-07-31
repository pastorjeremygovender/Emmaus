/**
 * pastor-name.ts — single source of truth for the pastoral display name
 * shown to members throughout the Emmaus experience.
 *
 * Use PASTOR_DISPLAY_NAME everywhere a pastor name is shown to members:
 *   - Sermon cards ("Pastor Jeremy preached…")
 *   - Ask Emmaus responses
 *   - Sermon Companion introductions
 *   - Recommendation cards
 *
 * DO NOT use this for:
 *   - Database IDs or author identifiers
 *   - File names
 *   - YouTube video titles
 *   - Internal APIs or analytics
 */
export const PASTOR_DISPLAY_NAME = 'Pastor Jeremy';
