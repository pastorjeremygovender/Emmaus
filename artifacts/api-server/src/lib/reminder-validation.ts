export function isValidReminderTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidIanaTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** A five-minute worker may start a little after the chosen minute. */
export function isReminderDue(reminderTime: string, localTime: string): boolean {
  const [reminderHour, reminderMinute] = reminderTime.split(":").map(Number);
  const [localHour, localMinute] = localTime.split(":").map(Number);
  const delta = localHour * 60 + localMinute - (reminderHour * 60 + reminderMinute);
  return delta >= 0 && delta < 10;
}