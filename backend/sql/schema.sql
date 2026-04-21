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
