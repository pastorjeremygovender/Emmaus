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