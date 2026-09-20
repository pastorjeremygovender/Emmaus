import webpush from "web-push";
import {
  claimReminderDelivery,
  deactivateReminderSubscriptionById,
  hasCompletedDailyRhythm,
  isValidIanaTimezone,
  listReminderSubscriptions,
  markReminderDelivery,
  type StoredReminderSubscription,
} from "./reminder-store.js";
import { isReminderDue } from "./reminder-validation.js";
import { logger } from "./logger.js";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

export function reminderConfig() {
  const supported = Boolean(publicKey && privateKey && subject);
  return { supported, vapidPublicKey: publicKey ?? null };
}

function localParts(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).reduce<Record<string, string>>((out, part) => {
    out[part.type] = part.value; return out;
  }, {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

async function sendClaimed(subscription: StoredReminderSubscription, ledgerId?: string) {
  try {
    if (!reminderConfig().supported) throw new Error("Push reminders are not configured");
    webpush.setVapidDetails(subject!, publicKey!, privateKey!);
    await webpush.sendNotification(JSON.parse(subscription.subscription), JSON.stringify({
      title: "A quiet moment with Jesus",
      body: "Your next 10 Minutes with Jesus is ready whenever you are.",
      url: "/daily-rhythm/navigate",
    }));
    if (ledgerId) await markReminderDelivery(ledgerId, "delivered");
    return { sent: true };
  } catch (err: unknown) {
    const statusCode = typeof err === "object" && err !== null && "statusCode" in err
      ? Number((err as { statusCode: unknown }).statusCode) : 0;
    if (statusCode === 404 || statusCode === 410) {
      await deactivateReminderSubscriptionById(subscription.id);
    }
    if (ledgerId) await markReminderDelivery(ledgerId, "failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function sendReminderTest(subscription: StoredReminderSubscription): Promise<void> {
  if (!reminderConfig().supported) throw new Error("Push reminders are not configured");
  await sendClaimed(subscription);
}

/** One-shot worker entrypoint; it intentionally owns no timer or server lifecycle. */
export async function deliverDueReminders(now = new Date()): Promise<{ sent: number; skipped: number }> {
  if (!reminderConfig().supported) {
    logger.warn("Reminder worker skipped: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT are required");
    return { sent: 0, skipped: 0 };
  }
  let sent = 0;
  let skipped = 0;
  for (const subscription of await listReminderSubscriptions()) {
    if (!isValidIanaTimezone(subscription.timezone)) { skipped++; continue; }
    const local = localParts(subscription.timezone, now);
    if (
      !isReminderDue(subscription.reminderTime, local.time) ||
      await hasCompletedDailyRhythm(subscription.userId, local.date, subscription.timezone)
    ) {
      skipped++; continue;
    }
    const ledgerId = await claimReminderDelivery(subscription.id, local.date);
    if (!ledgerId) { skipped++; continue; }
    // Re-check after the unique claim to narrow the completion/send race. The
    // consumed claim intentionally preserves the at-most-once daily guarantee.
    if (await hasCompletedDailyRhythm(subscription.userId, local.date, subscription.timezone)) {
      await markReminderDelivery(ledgerId, "skipped", "Daily Rhythm completed before delivery");
      skipped++;
      continue;
    }
    try {
      await sendClaimed(subscription, ledgerId);
      sent++;
    } catch (err) {
      logger.warn({ err, subscriptionId: subscription.id }, "Reminder push delivery failed");
    }
  }
  return { sent, skipped };
}