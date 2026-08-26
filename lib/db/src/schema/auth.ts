import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export type UserRole = "user" | "admin" | "superAdmin";
export type AccountStatus = "active" | "removed";

// Emmaus session storage. Session identifiers are random, opaque values;
// provider access tokens never reach browser JavaScript.
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Immutable provider identities. The primary key is the verified provider subject.
export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const authBootstrapStateTable = pgTable("auth_bootstrap_state", {
  key: text("key").primaryKey(),
  claimedBy: varchar("claimed_by")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Existing Emmaus profile table, now bound additively to a verified provider
// subject. Email remains the compatibility key for existing rows, while all
// authorization decisions use authSubject and appRole.
export const userProfilesTable = pgTable(
  "user_profiles",
  {
    email: text("email").primaryKey(),
    preferredName: text("preferred_name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    pastoralRole: text("pastoral_role"),
    authorizedRoomLeader: boolean("authorized_room_leader")
      .notNull()
      .default(false),
    authSubject: varchar("auth_subject")
      .unique()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    appRole: text("app_role").$type<UserRole>().notNull().default("user"),
    roleAssignedAt: timestamp("role_assigned_at", { withTimezone: true }),
    accountStatus: text("account_status")
      .$type<AccountStatus>()
      .notNull()
      .default("active"),
    timezone: text("timezone").notNull().default("Africa/Johannesburg"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: varchar("removed_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "user_profiles_app_role_check",
      sql`${table.appRole} in ('user', 'admin', 'superAdmin')`,
    ),
  ],
);

// A subject-level block retained after permanent account deletion. It prevents
// a delayed or retried provider response from recreating the local identity.
export const permanentlyDeletedAccountsTable = pgTable(
  "permanently_deleted_accounts",
  {
    accountId: varchar("account_id").primaryKey(),
    email: text("email").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedBy: varchar("deleted_by").notNull(),
  },
);

export type UpsertUser = typeof usersTable.$inferInsert;
export type AuthIdentity = typeof usersTable.$inferSelect;
export type UserProfile = typeof userProfilesTable.$inferSelect;