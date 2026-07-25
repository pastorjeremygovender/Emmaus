/**
 * Notification wording — Emmaus pastoral voice.
 *
 * Rules:
 *   - Encouragement only. Never guilt or urgency.
 *   - Never: "You missed yesterday.", "You're behind.", "Don't break your streak."
 *   - Always: warm, calm, one step at a time.
 *
 * These constants are used for in-app prompts and prepare the system for future
 * push notification integration.
 */

export const NOTIFICATION_COPY = {
  dailyReady: {
    title: 'Your time with Jesus is ready.',
    body: 'Good morning. Today\'s Journey is ready whenever you are.',
  },
  devotionalReady: {
    title: "Today's devotional is waiting for you.",
    body: 'A few minutes of Scripture and reflection to anchor your day.',
  },
  journeyContinue: {
    title: 'Continue your Journey whenever you\'re ready.',
    body: 'Your next step is waiting. No rush — just one step at a time.',
  },
  weeklyEncouragement: {
    title: 'Good morning.',
    body: "Today's Journey is ready.",
  },
} as const;

export type NotificationKey = keyof typeof NOTIFICATION_COPY;
