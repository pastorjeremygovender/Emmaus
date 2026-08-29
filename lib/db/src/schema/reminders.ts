import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./auth.ts";

/** A browser/device push endpoint. Endpoints, rather than users, are unique. */
export const reminderSubscriptionsTable = pgTable(
  "reminder_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    subscription: text("subscription").notNull(),
    reminderTime: text("reminder_time").notNull(),
    timezone: text("timezone").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("reminder_subscriptions_endpoint_unique").on(table.endpoint),
    index("reminder_subscriptions_user_idx").on(table.userId),
  ],
);

/** One immutable claim per device and local calendar day, preventing duplicate sends. */
export const reminderDeliveryLedgerTable = pgTable(
  "reminder_delivery_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id").notNull()
      .references(() => reminderSubscriptionsTable.id, { onDelete: "cascade" }),
    localDate: text("local_date").notNull(),
    status: text("status").notNull().default("claimed"),
    error: text("error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("reminder_delivery_subscription_date_unique").on(table.subscriptionId, table.localDate),
    index("reminder_delivery_ledger_status_idx").on(table.status),
  ],
);

export type ReminderSubscription = typeof reminderSubscriptionsTable.$inferSelect;