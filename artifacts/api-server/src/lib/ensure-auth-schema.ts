import { pool } from "@workspace/db";

/**
 * Authentication cannot run safely against a partially migrated database.
 * Keep this additive and idempotent; unlike legacy content migrations, failure
 * here is fatal and prevents the server from accepting requests.
 */
export async function ensureAuthSchema(): Promise<void> {
  await pool.query(`
    BEGIN;

    CREATE TABLE IF NOT EXISTS users (
      id varchar PRIMARY KEY,
      email varchar UNIQUE,
      first_name varchar,
      last_name varchar,
      profile_image_url varchar,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid varchar PRIMARY KEY,
      sess jsonb NOT NULL,
      expire timestamp NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS auth_subject varchar;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS app_role text NOT NULL DEFAULT 'user';
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS role_assigned_at timestamptz;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS home_defaults_initialized_at timestamptz;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS contact_number text;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS physical_address text;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS icc_membership text;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS removed_at timestamptz;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS removed_by varchar;
    ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
    CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_auth_subject_unique
      ON user_profiles (auth_subject);

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_profiles_auth_subject_users_id_fk'
      ) THEN
        ALTER TABLE user_profiles
          ADD CONSTRAINT user_profiles_auth_subject_users_id_fk
          FOREIGN KEY (auth_subject) REFERENCES users(id) ON DELETE RESTRICT;
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_profiles_icc_membership_check'
      ) THEN
        ALTER TABLE user_profiles
          ADD CONSTRAINT user_profiles_icc_membership_check
          CHECK (icc_membership IS NULL OR icc_membership IN ('yes', 'no', 'unsure'));
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_profiles_account_status_check'
      ) THEN
        ALTER TABLE user_profiles
          ADD CONSTRAINT user_profiles_account_status_check
          CHECK (account_status IN ('active', 'removed'));
      END IF;
    END $$;

    CREATE INDEX IF NOT EXISTS user_profiles_account_status_idx
      ON user_profiles (account_status);

    CREATE TABLE IF NOT EXISTS account_lifecycle_audit (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id varchar NOT NULL,
      action text NOT NULL CHECK (action IN ('removed', 'reinstated', 'permanently_deleted')),
      actor_id varchar NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      detail jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS account_lifecycle_audit_account_idx
      ON account_lifecycle_audit (account_id, occurred_at DESC);

    -- A permanent deletion must survive a provider-side retry. The immutable
    -- provider subject remains blocked here if provider deletion is delayed.
    CREATE TABLE IF NOT EXISTS permanently_deleted_accounts (
      account_id varchar PRIMARY KEY,
      email text NOT NULL,
      deleted_at timestamptz NOT NULL DEFAULT now(),
      deleted_by varchar NOT NULL
    );
    -- Repair any identity that could have been recreated by an older server
    -- during a provider-login vs permanent-purge race.
    DELETE FROM sessions s
    USING permanently_deleted_accounts p
    WHERE s.sess -> 'user' ->> 'id' = p.account_id;
    DELETE FROM user_profiles up
    USING permanently_deleted_accounts p
    WHERE up.auth_subject = p.account_id;
    DELETE FROM users u
    USING permanently_deleted_accounts p
    WHERE u.id = p.account_id;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'user_profiles_app_role_check'
      ) THEN
        ALTER TABLE user_profiles
          ADD CONSTRAINT user_profiles_app_role_check
          CHECK (app_role IN ('user', 'admin', 'superAdmin'));
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS auth_bootstrap_state (
      key text PRIMARY KEY,
      claimed_by varchar NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      claimed_at timestamptz NOT NULL DEFAULT now()
    );

    COMMIT;
  `);
}