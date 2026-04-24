CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subjects (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS study_goals (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  target_hours  NUMERIC(6,2) NOT NULL CHECK (target_hours > 0),
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Paused','Completed')),
  target_date   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS study_goals_user_id_idx ON study_goals(user_id);

CREATE TABLE IF NOT EXISTS goal_subjects (
  goal_id    INTEGER NOT NULL REFERENCES study_goals(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, subject_id)
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id               SERIAL PRIMARY KEY,
  goal_id          INTEGER NOT NULL REFERENCES study_goals(id) ON DELETE CASCADE,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  notes            TEXT,
  logged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS study_sessions_goal_id_idx ON study_sessions(goal_id);

ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS quality INTEGER CHECK (quality BETWEEN 1 AND 5);
ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_google_tokens (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token  TEXT,
  refresh_token TEXT,
  expiry_date   BIGINT,
  scope         TEXT,
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE study_sessions
  ADD COLUMN IF NOT EXISTS gcal_event_id TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS study_rooms (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  passcode_hash TEXT,
  created_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS room_members (
  room_id   INTEGER NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS room_members_user_id_idx ON room_members(user_id);
