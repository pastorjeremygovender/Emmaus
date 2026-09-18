import { deliverDueReminders } from "../lib/reminder-service.js";
import { logger } from "../lib/logger.js";
import { runStartupMigrations } from "../lib/startup-migrations.js";

try {
  // A scheduler may run before a freshly deployed API instance has received a
  // request, so make the additive tables safe before claiming any deliveries.
  await runStartupMigrations();
  const result = await deliverDueReminders();
  logger.info(result, "Reminder worker completed");
} catch (err) {
  logger.error({ err }, "Reminder worker failed");
  process.exitCode = 1;
}